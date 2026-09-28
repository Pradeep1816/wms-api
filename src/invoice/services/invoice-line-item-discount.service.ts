import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InvoicePosLinesService } from './invoice-pos-lines.service';
import { InjectEntityManager, InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { plainToInstance } from 'class-transformer';
import { InvoiceLineItem } from '../entities/invoice-line-item.entity';
import { InvoiceLineItemDiscount } from '../entities/invoice-line-item-discount.entity';
import { Invoice } from '../entities/invoice.entity';
import { InvoicePayment } from '../entities/invoice-payment.entity';
import { InvoiceLineItemDiscountRepository } from '../repositories/invoice-line-item-discount.repository';
import { InvoiceLineItemUpdateRepository } from '../repositories/invoice-line-item-update.repository';
import { InvoiceDiscountCalculator } from './calculations/invoice-discount.calculator';
import { EditInvoiceLineItemDiscountDto } from '../dto/invoice-line-item-discount-request.dto';
import { GetInvoiceLineItemDiscountResponseDto } from '../dto/invoice-line-item-discount-response.dto';
import { ItemTypeEnum } from '../enums/item-type.enum';
import { RoundingUtils } from '../../utils/rounding.utils';
import { INVOICE_STATUS } from '../../utils/helper';
import { CustomerBalanceRecalculatorService } from '../../shared/services/customer-balance-recalculator.service';

@Injectable()
export class InvoiceLineItemDiscountService {
  constructor(
    @InjectEntityManager()
    private readonly entityManager: EntityManager,
    @InjectRepository(InvoiceLineItem)
    private readonly lineItemRepository: Repository<InvoiceLineItem>,
    @InjectRepository(Invoice)
    private readonly invoiceRepository: Repository<Invoice>,
    @InjectRepository(InvoicePayment)
    private readonly invoicePaymentRepository: Repository<InvoicePayment>,
    private readonly discountRepository: InvoiceLineItemDiscountRepository,
    private readonly discountCalculator: InvoiceDiscountCalculator,
    private readonly updateRepository: InvoiceLineItemUpdateRepository,
    private readonly customerBalanceRecalculatorService: CustomerBalanceRecalculatorService,
    private readonly posLines: InvoicePosLinesService,
  ) {}

  // Get discount values. Returns common values or null if differ across items.
  async getDiscount(
    lineItemIds: number[],
    locationId: number,
  ): Promise<{ body: GetInvoiceLineItemDiscountResponseDto }> {
    try {
      // Validate all line items and get the last one (matching PHP: end($lineItemIds))
      const lastLineItem = await this.findAndValidateLineItem(
        lineItemIds[lineItemIds.length - 1],
        locationId,
        ['invoice', 'item'],
      );

      // Load discounts for all line items and determine common values
      const discountValues = await this.resolveMultiItemDiscounts(lineItemIds);
      const isLesson = this.isLessonItem(lastLineItem.itemTypeId);

      const response = plainToInstance(GetInvoiceLineItemDiscountResponseDto, {
        lineItemIds,
        lineItemDiscount: discountValues.lineItemDiscount,
        lineItemDiscountValueType: discountValues.lineItemDiscountValueType,
        customerDiscount: discountValues.customerDiscount,
        paymentFrequencyDiscount: isLesson ? discountValues.paymentFrequencyDiscount : null,
        multiEnrolmentDiscount: isLesson ? discountValues.multiEnrolmentDiscount : null,
        isLessonItem: isLesson,
      });

      return { body: response };
    } catch (error) {
      console.error('Error in getDiscount service:', error);

      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }

      throw new BadRequestException(
        `Failed to get discount: ${error.message}`,
      );
    }
  }

  // Update discount values for line items. Lesson-only discounts applied only to lesson types.
  async updateDiscount(
    lineItemIds: number[],
    locationId: number,
    locationSlug: string,
    dto: EditInvoiceLineItemDiscountDto,
    userId: number,
  ): Promise<{ status: boolean; message?: string }> {
    try {
      // Validate the last line item for invoice-level guards (matching PHP)
      const lastLineItem = await this.findAndValidateLineItem(
        lineItemIds[lineItemIds.length - 1],
        locationId,
        ['invoice', 'discounts'],
      );
      await this.validateForUpdate(lastLineItem);

      return this.entityManager.transaction(async (manager) => {
        if (manager.queryRunner) {
          manager.queryRunner.data = {
            ...(manager.queryRunner.data ?? {}),
            currentUserId: userId,
          };
        }
        const lineItemRepo = manager.getRepository(InvoiceLineItem);
        const invoiceRepo = manager.getRepository(Invoice);
        const invoiceIdsToRecalculate = new Set<number>();
        const customerIdsToRecalculate = new Set<number>();

        const references = await lineItemRepo.createQueryBuilder('line').where('line.id IN (:...ids)', { ids: lineItemIds }).getMany();
        for (const invoiceId of [...new Set(references.map(line => line.invoiceId))].sort((a,b)=>a-b)) {
          const invoice = await this.posLines.lockInvoice(manager, locationId, invoiceId);
          if (await lineItemRepo.existsBy({ invoiceId, isPos: true, isDeleted: false })) await this.posLines.assertEditable(manager, invoice);
        }

        // Loop through each line item ID (matching PHP foreach)
        for (const lineItemId of lineItemIds) {
          const lineItem = await lineItemRepo.findOne({
            where: { id: lineItemId },
            relations: ['invoice', 'discounts'],
          });

          if (!lineItem) {
            throw new NotFoundException(`Line item ${lineItemId} not found`);
          }

          const isLesson = this.isLessonItem(lineItem.itemTypeId);

          // Upsert discount records for this line item
          await this.upsertDiscountsFromDto(lineItemId, dto, isLesson, manager);

          // Recalculate this line item's totals
          const updatedLineItem = await lineItemRepo.findOne({
            where: { id: lineItemId },
            relations: ['discounts'],
          });

          if (!updatedLineItem) {
            throw new NotFoundException(`Line item ${lineItemId} not found after update`);
          }

          const invoice = await invoiceRepo.findOne({
            where: { id: updatedLineItem.invoiceId },
            relations: ['lineItems', 'lineItems.discounts'],
          });

          if (!invoice) {
            throw new NotFoundException('Invoice not found');
          }

          const discount = this.discountCalculator.calculateLineItemDiscount(updatedLineItem, invoice);
          const grossPrice = this.getGrossPrice(updatedLineItem);
          const netTotal = RoundingUtils.roundHalfUp(grossPrice - discount, 4);
          if (updatedLineItem.isPos && netTotal < 0) throw new BadRequestException('Discount cannot exceed the POS item price.');
          const taxRate = updatedLineItem.isPos
            ? netTotal * Number(updatedLineItem.posSnapshot?.taxPercent || 0) / 100
            : await this.calculateTaxRate(netTotal, updatedLineItem.taxStatus);

          updatedLineItem.netTotal = netTotal;
          updatedLineItem.taxRate = taxRate;
          await lineItemRepo.save(updatedLineItem);

          invoiceIdsToRecalculate.add(updatedLineItem.invoiceId);
          customerIdsToRecalculate.add(lineItem.invoice.userId);
        }

        // Recalculate invoice totals for all affected invoices
        for (const invoiceId of invoiceIdsToRecalculate) {
          await this.recalculateInvoiceTotals(manager, invoiceId, userId);
        }

        // Match legacy Invoice::afterSave -> User::updateCustomerBalance.
        for (const customerId of customerIdsToRecalculate) {
          await this.customerBalanceRecalculatorService.recalculateAndPersist(customerId, {
            manager,
            locationSlug,
            updatedByUserId: userId,
          });
        }

        return { status: true, message: 'Discount updated successfully' };
      });
    } catch (error) {
      console.error('Error in updateDiscount service:', error);

      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }

      throw new BadRequestException(
        `Failed to update discount: ${error.message}`,
      );
    }
  }

  // Resolve discount values: returns common value or null if differ across items
  private async resolveMultiItemDiscounts(lineItemIds: number[]): Promise<{
    lineItemDiscount: number | null;
    lineItemDiscountValueType: number;
    customerDiscount: number | null;
    paymentFrequencyDiscount: number | null;
    multiEnrolmentDiscount: number | null;
  }> {
    let lineItemDiscountValue: number | null = undefined as any;
    let lineItemDiscountValueType: number = InvoiceLineItemDiscount.VALUE_TYPE_DOLLAR;
    let customerDiscountValue: number | null = undefined as any;
    let paymentFrequencyDiscountValue: number | null = undefined as any;
    let multiEnrolmentDiscountValue: number | null = undefined as any;

    let isLineItemDiff = false;
    let isCustomerDiff = false;
    let isPaymentFrequencyDiff = false;
    let isMultiEnrolmentDiff = false;

    for (let i = 0; i < lineItemIds.length; i++) {
      const discounts = await this.discountRepository.findByLineItemId(lineItemIds[i]);
      const discountMap = new Map<number, InvoiceLineItemDiscount>();
      for (const d of discounts) {
        discountMap.set(d.type, d);
      }

      const liDiscount = discountMap.get(InvoiceLineItemDiscount.TYPE_LINE_ITEM);
      const cuDiscount = discountMap.get(InvoiceLineItemDiscount.TYPE_CUSTOMER);
      const pfDiscount = discountMap.get(InvoiceLineItemDiscount.TYPE_ENROLMENT_PAYMENT_FREQUENCY);
      const meDiscount = discountMap.get(InvoiceLineItemDiscount.TYPE_MULTIPLE_ENROLMENT);

      const liVal = liDiscount?.value ?? null;
      const cuVal = cuDiscount?.value ?? null;
      const pfVal = pfDiscount?.value ?? null;
      const meVal = meDiscount?.value ?? null;

      if (i === 0) {
        lineItemDiscountValue = liVal;
        lineItemDiscountValueType = liDiscount?.valueType ?? InvoiceLineItemDiscount.VALUE_TYPE_DOLLAR;
        customerDiscountValue = cuVal;
        paymentFrequencyDiscountValue = pfVal;
        multiEnrolmentDiscountValue = meVal;
      } else {
        if (parseFloat(String(lineItemDiscountValue)) !== parseFloat(String(liVal))) {
          isLineItemDiff = true;
        }
        if (parseFloat(String(customerDiscountValue)) !== parseFloat(String(cuVal))) {
          isCustomerDiff = true;
        }
        if (parseFloat(String(paymentFrequencyDiscountValue)) !== parseFloat(String(pfVal))) {
          isPaymentFrequencyDiff = true;
        }
        if (parseFloat(String(multiEnrolmentDiscountValue)) !== parseFloat(String(meVal))) {
          isMultiEnrolmentDiff = true;
        }
      }
    }

    return {
      lineItemDiscount: isLineItemDiff ? null : lineItemDiscountValue,
      lineItemDiscountValueType,
      customerDiscount: isCustomerDiff ? null : customerDiscountValue,
      paymentFrequencyDiscount: isPaymentFrequencyDiff ? null : paymentFrequencyDiscountValue,
      multiEnrolmentDiscount: isMultiEnrolmentDiff ? null : multiEnrolmentDiscountValue,
    };
  }

  // Find and validate line item with location check and isPosted guard
  private async findAndValidateLineItem(
    lineItemId: number,
    locationId: number,
    relations: string[],
  ): Promise<InvoiceLineItem> {
    const lineItem = await this.lineItemRepository.findOne({
      where: { id: lineItemId },
      relations,
    });

    if (!lineItem) {
      throw new NotFoundException('Line item not found');
    }

    if (lineItem.invoice.locationId !== locationId) {
      throw new NotFoundException('Line item not found in this location');
    }

    if (lineItem.invoice.isPosted) {
      throw new BadRequestException('Discount cannot be applied if invoice posted');
    }

    return lineItem;
  }

  // Validate for update: check isDeleted, payment credit, opening balance, lesson credit
  private async validateForUpdate(lineItem: InvoiceLineItem): Promise<void> {
    if (lineItem.invoice.isDeleted) {
      throw new BadRequestException('Invoice is deleted');
    }

    if (lineItem.isDeleted) {
      throw new BadRequestException('Line item is deleted');
    }

    const firstLineItem = await this.lineItemRepository.findOne({
      where: { invoiceId: lineItem.invoiceId, isDeleted: false },
      order: { id: 'ASC' },
    });

    if (firstLineItem?.itemTypeId === 10) {
      throw new BadRequestException('Payment credit invoices are not editable');
    }

    if (lineItem.itemTypeId === ItemTypeEnum.TYPE_OPENING_BALANCE) {
      throw new BadRequestException('Opening balance items cannot have discounts');
    }

    if (lineItem.itemTypeId === ItemTypeEnum.TYPE_LESSON_CREDIT) {
      throw new BadRequestException('Lesson credit items cannot have discounts');
    }
  }

  // Upsert discount records. Lesson-only discounts skipped if not lesson type.
  private async upsertDiscountsFromDto(
    lineItemId: number,
    dto: EditInvoiceLineItemDiscountDto,
    isLesson: boolean,
    manager: EntityManager,
  ): Promise<void> {
    if (dto.lineItemDiscount !== undefined) {
      const valueType = dto.lineItemDiscountValueType ?? InvoiceLineItemDiscount.VALUE_TYPE_DOLLAR;
      await this.discountRepository.upsertDiscount(
        lineItemId, InvoiceLineItemDiscount.TYPE_LINE_ITEM, dto.lineItemDiscount, valueType, manager,
      );
    }

    if (dto.customerDiscount !== undefined) {
      await this.discountRepository.upsertDiscount(
        lineItemId, InvoiceLineItemDiscount.TYPE_CUSTOMER, dto.customerDiscount,
        InvoiceLineItemDiscount.VALUE_TYPE_PERCENTAGE, manager,
      );
    }

    if (isLesson && dto.paymentFrequencyDiscount !== undefined) {
      await this.discountRepository.upsertDiscount(
        lineItemId, InvoiceLineItemDiscount.TYPE_ENROLMENT_PAYMENT_FREQUENCY,
        dto.paymentFrequencyDiscount, InvoiceLineItemDiscount.VALUE_TYPE_PERCENTAGE, manager,
      );
    }

    if (isLesson && dto.multiEnrolmentDiscount !== undefined) {
      await this.discountRepository.upsertDiscount(
        lineItemId, InvoiceLineItemDiscount.TYPE_MULTIPLE_ENROLMENT,
        dto.multiEnrolmentDiscount, InvoiceLineItemDiscount.VALUE_TYPE_DOLLAR, manager,
      );
    }
  }

  private isLessonItem(itemTypeId: number): boolean {
    return [
      ItemTypeEnum.TYPE_PRIVATE_LESSON,
      ItemTypeEnum.TYPE_GROUP_LESSON,
      ItemTypeEnum.TYPE_PAYMENT_CYCLE_PRIVATE_LESSON,
      ItemTypeEnum.TYPE_EXTRA_LESSON,
    ].includes(itemTypeId);
  }

  private getGrossPrice(lineItem: InvoiceLineItem): number {
    const amount = lineItem.itemTypeId === ItemTypeEnum.TYPE_GROUP_LESSON
      ? lineItem.amount
      : lineItem.amount * lineItem.unit;
    return RoundingUtils.roundHalfUp(amount, 2);
  }

  private async calculateTaxRate(netTotal: number, taxStatusName: string): Promise<number> {
    if (taxStatusName === 'No Tax') {
      return 0;
    }

    const taxData = await this.updateRepository.lookupTaxData(taxStatusName);
    if (!taxData) {
      return 0;
    }

    return RoundingUtils.roundHalfUp((netTotal * taxData.taxCodeRate) / 100, 4);
  }

  private async recalculateInvoiceTotals(
    manager: EntityManager,
    invoiceId: number,
    userId: number,
  ): Promise<void> {
    const lineItemRepo = manager.getRepository(InvoiceLineItem);
    const invoiceRepo = manager.getRepository(Invoice);

    const lineItems = await lineItemRepo.find({
      where: { invoiceId, isDeleted: false },
    });

    let subTotal = 0;
    let taxTotal = 0;

    for (const item of lineItems) {
      subTotal += Number(item.netTotal) || 0;
      taxTotal += Number(item.taxRate) || 0;
    }

    subTotal = RoundingUtils.roundHalfUp(subTotal, 4);
    taxTotal = RoundingUtils.roundHalfUp(taxTotal, 4);
    const total = RoundingUtils.roundHalfUp(subTotal + taxTotal, 4);

    const result = await manager
      .createQueryBuilder()
      .select('COALESCE(SUM(ip.amount), 0)', 'totalPaid')
      .from('invoice_payment', 'ip')
      .innerJoin('payment', 'p', 'p.id = ip.payment_id AND p.isDeleted = 0')
      .where('ip.invoice_id = :invoiceId', { invoiceId })
      .andWhere('ip.isDeleted = 0')
      .getRawOne();

    const totalPayments = parseFloat(result?.totalPaid) || 0;
    const balance = RoundingUtils.roundHalfUp(total - totalPayments, 4);

    let status: number = INVOICE_STATUS.OWING;
    if (RoundingUtils.isBalanceZero(balance)) {
      status = INVOICE_STATUS.PAID;
    } else if (balance < -0.09) {
      status = INVOICE_STATUS.CREDIT;
    }

    await invoiceRepo.update(invoiceId, {
      subTotal,
      tax: taxTotal,
      total,
      balance,
      status,
      updatedUserId: userId,
    });
  }
}
