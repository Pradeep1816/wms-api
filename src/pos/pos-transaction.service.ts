import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { CreatePosTransactionDto } from './dto/create-pos-transaction.dto';
import { AddLineItemDto } from './dto/add-line-item.dto';
import { UpdateLineItemDto } from './dto/update-line-item.dto';
import { ProcessPaymentDto } from './dto/process-payment.dto';
import { UpdatePosTransactionCustomerDto } from './dto/update-pos-transaction-customer.dto';
import { ReversePosTransactionDto } from './dto/reverse-pos-transaction.dto';
import {
  PosTransaction,
  PosTransactionReversalType,
  PosTransactionStatus,
} from './entities/pos-transaction.entity';
import { PosTransactionLineItem } from './entities/pos-transaction-line-item.entity';
import { Item } from '../item/entities/item.entity';
import { LocationWalkinCustomer } from '../location/entities/location-walkin-customer.entity';
import { ItemLocationStock } from '../item/entities/item-location-stock.entity';
import { queueLowStockAlert } from '../item/services/low-stock-alert.util';
import { ItemCategory } from '../item/entities/item-category.entity';
import { UpcValidatorService } from './services/upc-validator.service';
import { LocationService } from '../location/services/location.service';
import { TaxRepository } from '../tax/repositories/tax.repository';
import { CustomerBalanceRecalculatorService } from '../shared/services/customer-balance-recalculator.service';
import { resolveRoyaltySnapshot } from '../utils/royality/royalty-calculation.util';
import { ReceivePaymentRepository } from '../invoice/repositories/receive-payment.repository';
import { Payment } from '../payment/entities/payment.entity';
import { PaymentMethod } from '../payment/entities/payment-method.entity';
import { getCurrentESTDate } from '../utils/date-utils';
import { RoundingUtils } from '../utils/rounding.utils';
import { InvoicePosLinesService } from '../invoice/services/invoice-pos-lines.service';
import { InvoiceCreateRepository } from '../invoice/repositories/invoice-create.repository';
import { Invoice } from '../invoice/entities/invoice.entity';
import { InvoiceLineItem } from '../invoice/entities/invoice-line-item.entity';
import { InvoiceLineItemDiscount } from '../invoice/entities/invoice-line-item-discount.entity';

@Injectable()
export class PosTransactionService {
  constructor(
    @InjectRepository(PosTransaction)
    private readonly posTransactionRepository: Repository<PosTransaction>,
    @InjectRepository(PosTransactionLineItem)
    private readonly lineItemRepository: Repository<PosTransactionLineItem>,
    @InjectRepository(Item)
    private readonly itemRepository: Repository<Item>,
    private readonly upcValidatorService: UpcValidatorService,
    private readonly locationService: LocationService,
    private readonly taxRepository: TaxRepository,
    private readonly customerBalanceRecalculatorService: CustomerBalanceRecalculatorService,
    private readonly receivePaymentRepository: ReceivePaymentRepository,
    private readonly invoiceLines: InvoicePosLinesService,
    private readonly invoiceCreator: InvoiceCreateRepository,
  ) {}

  // Every cart mutation and checkout locks the same parent row. Repositories in
  // the scoped service share that transaction, including recalculation writes.
  private async withTransaction<T>(
    id: number,
    locationId: number,
    action: (service: PosTransactionService) => Promise<T>,
  ): Promise<T> {
    return this.posTransactionRepository.manager.transaction(
      async (manager) => {
        const transaction = await manager
          .getRepository(PosTransaction)
          .findOne({
            where: { id, locationId },
            lock: { mode: 'pessimistic_write' },
          });
        if (!transaction)
          throw new NotFoundException(
            'POS transaction not found for this location',
          );
        return action(this.scopedTo(manager));
      },
    );
  }

  private scopedTo(manager: EntityManager): PosTransactionService {
    return new PosTransactionService(
      manager.getRepository(PosTransaction),
      manager.getRepository(PosTransactionLineItem),
      manager.getRepository(Item),
      this.upcValidatorService,
      this.locationService,
      this.taxRepository,
      this.customerBalanceRecalculatorService,
      this.receivePaymentRepository,
      this.invoiceLines,
      this.invoiceCreator,
    );
  }

  async createInvoice(id: number, locationId: number, locationSlug: string, userId: number) {
    return this.withTransaction(id, locationId, service => service.createInvoiceLocked(id, locationSlug, userId));
  }

  private async createInvoiceLocked(id: number, locationSlug: string, userId: number) {
    const manager = this.posTransactionRepository.manager;
    this.invoiceLines.audit(manager, userId);
    const cart = await this.loadTransaction(id);
    if (cart.status === PosTransactionStatus.INVOICED && cart.invoiceId) {
      const invoice = await manager.findOneByOrFail(Invoice, { id: cart.invoiceId });
      return { invoiceId: invoice.id, invoiceNumber: `I-${String(invoice.invoiceNumber).padStart(5, '0')}` };
    }
    if (cart.status !== PosTransactionStatus.DRAFT || cart.paymentId || !cart.lineItems.length) {
      throw new BadRequestException('Only a draft POS purchase with items can create an invoice.');
    }
    const mapping = await manager.findOneBy(LocationWalkinCustomer, { locationId: cart.locationId });
    const customerId = cart.isWalkIn ? mapping?.customerId : cart.customerId;
    if (!customerId) throw new BadRequestException('Select a customer or choose walk-in before creating the invoice.');
    const isWalkIn = Number(mapping?.customerId) === Number(customerId);
    await this.validateCustomerForTransaction(customerId, cart.locationId, !isWalkIn);
    const transactionId = await this.invoiceCreator.createTransaction(userId, manager);
    const number = await this.invoiceCreator.getNextInvoiceNumber(cart.locationId, Invoice.TYPE_INVOICE, manager);
    const invoice = await this.invoiceCreator.createBlankInvoice(transactionId, customerId, cart.locationId, number, Invoice.TYPE_INVOICE, userId, manager);
    invoice.walkinBuyerName = isWalkIn && !['Walk-in Customer', 'Walkin Customer'].includes(cart.customerInfo || '') ? cart.customerInfo : null;
    await manager.save(Invoice, invoice);
    const subtotal = cart.lineItems.reduce((sum, line) => sum + Number(line.getLineItemTotal()), 0);
    if (Number(cart.discountAmount) > subtotal || subtotal < 0) throw new BadRequestException('Discount exceeds the purchase amount.');
    let allocatedDiscount = 0;
    // Stable item order serializes carts touching the same inventory rows.
    const lines = [...cart.lineItems].sort((a,b) => a.itemId-b.itemId || a.id-b.id);
    for (const [index, source] of lines.entries()) {
      const line = await this.invoiceLines.addInTransaction(manager, invoice, source.itemId, Number(source.quantity), false);
      line.amount = Number(source.overridePrice ?? source.price);
      const share = index === lines.length - 1
        ? this.roundCurrency(Number(cart.discountAmount) - allocatedDiscount)
        : this.roundCurrency(subtotal > 0 ? Number(cart.discountAmount) * source.getLineItemTotal() / subtotal : 0);
      allocatedDiscount += share;
      const discount = Number(source.discount || 0) + share;
      if (discount < 0 || discount > Number(line.amount) * Number(line.unit)) throw new BadRequestException('Discount exceeds the item amount.');
      if (discount) {
        line.discounts = [await manager.save(InvoiceLineItemDiscount, manager.create(InvoiceLineItemDiscount, {
          invoiceLineItemId: line.id, type: InvoiceLineItemDiscount.TYPE_LINE_ITEM,
          valueType: InvoiceLineItemDiscount.VALUE_TYPE_DOLLAR, value: discount,
        }))];
      }
      this.invoiceLines.priceLine(line, invoice);
      await manager.save(InvoiceLineItem, line);
    }
    await this.invoiceLines.recalculate(manager, invoice, locationSlug, userId);
    cart.status = PosTransactionStatus.INVOICED;
    cart.invoiceId = invoice.id;
    cart.customerId = customerId;
    await this.posTransactionRepository.save(cart);
    return { invoiceId: invoice.id, invoiceNumber: `I-${String(number).padStart(5, '0')}` };
  }

  async getTransaction(
    id: number,
    locationId: number,
  ): Promise<PosTransaction> {
    const transaction = await this.posTransactionRepository.findOne({
      where: { id, locationId },
      relations: ['lineItems', 'lineItems.item'],
    });
    if (!transaction)
      throw new NotFoundException(
        'POS transaction not found for this location',
      );
    return transaction;
  }

  async addLineItem(id: number, dto: AddLineItemDto, locationId: number) {
    return this.withTransaction(id, locationId, (service) =>
      service.addLineItemLocked(id, dto),
    );
  }
  async updateLineItem(
    id: number,
    lineId: number,
    dto: UpdateLineItemDto,
    locationId: number,
  ) {
    return this.withTransaction(id, locationId, (service) =>
      service.updateLineItemLocked(id, lineId, dto),
    );
  }
  async removeLineItem(id: number, lineId: number, locationId: number) {
    return this.withTransaction(id, locationId, (service) =>
      service.removeLineItemLocked(id, lineId),
    );
  }
  async updateCustomer(
    id: number,
    dto: UpdatePosTransactionCustomerDto,
    locationId: number,
  ) {
    return this.withTransaction(id, locationId, (service) =>
      service.updateCustomerLocked(id, dto),
    );
  }
  async cancelTransaction(id: number, locationId: number, userId?: number) {
    return this.withTransaction(id, locationId, (service) =>
      service.cancelTransactionLocked(id, userId),
    );
  }
  async applyDiscount(id: number, amount: number, locationId: number) {
    return this.withTransaction(id, locationId, (service) =>
      service.applyDiscountLocked(id, amount),
    );
  }
  async processPayment(
    dto: ProcessPaymentDto,
    locationId: number,
    userId: number,
  ) {
    // Historical paid transactions keep their receipt/reversal paths. A new
    // checkout must use invoice stock and payment recognition, even from an old UI.
    throw new BadRequestException('POS now creates an invoice. Refresh the POS page, create the invoice, then use Receive Payment.');
  }

  async reverseTransaction(
    id: number,
    locationId: number,
    dto: ReversePosTransactionDto,
    userId: number,
  ) {
    return this.withTransaction(id, locationId, (service) =>
      service.reverseTransactionLocked(id, dto, userId),
    );
  }

  async createTransaction(
    locationId: number,
    location: string,
    dto: CreatePosTransactionDto,
    userId?: number,
  ): Promise<PosTransaction> {
    const lockName = `pos_transaction_location_${locationId}`;

    try {
      // Acquire advisory lock for per-location sequence generation
      const lockRows = await this.posTransactionRepository.query(
        `SELECT GET_LOCK(?, 10) as lockStatus`,
        [lockName],
      );
      const lockStatus = Number(lockRows?.[0]?.lockStatus);
      if (lockStatus !== 1) {
        throw new BadRequestException(
          'Failed to acquire transaction lock. Please try again.',
        );
      }

      const result = await this.posTransactionRepository
        .createQueryBuilder('t')
        .select('MAX(t.transactionSequence)', 'maxSeq')
        .where('t.locationId = :locationId', { locationId })
        .getRawOne();

      const nextSequence = (result?.maxSeq || 0) + 1;

      const customerId = dto.customerId || null;
      let customerInfo = dto.customerInfo || null;
      if (customerId) {
        const customerName = await this.validateCustomerForTransaction(
          customerId,
          locationId,
        );
        customerInfo = customerInfo || customerName;
      }

      const transaction = this.posTransactionRepository.create({
        transactionId: `P${locationId.toString().padStart(3, '0')}${nextSequence.toString().padStart(5, '0')}`,
        locationId,
        transactionSequence: nextSequence,
        type: 'P',
        customerInfo,
        customerId,
        status: PosTransactionStatus.DRAFT,
        createdByUserId: userId || null,
      });

      return await this.posTransactionRepository.save(transaction);
    } catch (error) {
      console.error(
        `Transaction creation failed for location ${locationId}:`,
        error.message || error,
      );
      throw new BadRequestException(
        'Failed to create transaction. Please try again.',
      );
    } finally {
      // Always release the lock
      await this.posTransactionRepository.query(`SELECT RELEASE_LOCK(?)`, [
        lockName,
      ]);
    }
  }
  private async loadTransaction(id: number): Promise<PosTransaction> {
    const transaction = await this.posTransactionRepository.findOne({
      where: { id },
      relations: ['lineItems', 'lineItems.item'], // Include line items and item details
    });

    if (!transaction) {
      throw new NotFoundException(`Transaction with id ${id} not found`);
    }

    return transaction;
  }

  async getPaymentHistory(
    locationId: number,
    page = 1,
    limit = 20,
    customerId?: number,
  ) {
    const normalizedPage = Math.max(1, Number(page) || 1);
    const normalizedLimit = Math.min(50, Math.max(1, Number(limit) || 20));

    const [transactions, total] =
      await this.posTransactionRepository.findAndCount({
        where: {
          locationId,
          ...(Number.isInteger(customerId) && Number(customerId) > 0
            ? { customerId: Number(customerId) }
            : {}),
          status: In([
            PosTransactionStatus.PAID,
            PosTransactionStatus.VOIDED,
            PosTransactionStatus.REFUNDED,
          ]),
        },
        relations: ['lineItems', 'lineItems.item'],
        order: {
          paidAt: 'DESC',
          id: 'DESC',
        },
        skip: (normalizedPage - 1) * normalizedLimit,
        take: normalizedLimit,
      });

    const paymentIds = [
      ...new Set(
        transactions
          .flatMap((transaction) => [
            transaction.paymentId,
            transaction.refundPaymentId,
          ])
          .filter((paymentId): paymentId is number =>
            Number.isInteger(paymentId),
          ),
      ),
    ];

    const paymentRows =
      paymentIds.length > 0
        ? await this.posTransactionRepository.query(
            `
            SELECT
              payment.id,
              payment.date,
              payment.reference,
              payment.amount,
              payment.payment_method_id AS paymentMethodId,
              paymentMethod.name AS paymentMethodName
            FROM payment
            LEFT JOIN payment_method paymentMethod
              ON paymentMethod.id = payment.payment_method_id
            WHERE payment.id IN (?)
          `,
            [paymentIds],
          )
        : [];

    const paymentById = new Map<number, any>(
      paymentRows.map((payment) => [Number(payment.id), payment]),
    );

    return {
      success: true,
      data: {
        body: transactions.map((transaction) => {
          const payment = transaction.paymentId
            ? paymentById.get(Number(transaction.paymentId))
            : null;

          return {
            id: transaction.id,
            transactionId: transaction.transactionId,
            locationId: transaction.locationId,
            customerId: transaction.customerId,
            customerInfo: transaction.customerInfo,
            isWalkIn: transaction.isWalkIn,
            status: transaction.status,
            date: transaction.date,
            paidAt: transaction.paidAt,
            paymentId: transaction.paymentId,
            paymentMethodId: payment?.paymentMethodId
              ? Number(payment.paymentMethodId)
              : null,
            paymentMethodName: payment?.paymentMethodName || '',
            paymentReference: payment?.reference || '',
            reversalType: transaction.reversalType,
            reversalReason: transaction.reversalReason,
            reversedByUserId: transaction.reversedByUserId,
            reversedAt: transaction.reversedAt,
            refundPaymentId: transaction.refundPaymentId,
            refundAmount: transaction.refundPaymentId
              ? Math.abs(
                  Number(
                    paymentById.get(Number(transaction.refundPaymentId))
                      ?.amount || 0,
                  ),
                )
              : 0,
            refundReference: transaction.refundPaymentId
              ? paymentById.get(Number(transaction.refundPaymentId))
                  ?.reference || ''
              : '',
            subtotal: Number(transaction.subtotal) || 0,
            discountAmount: Number(transaction.discountAmount) || 0,
            tax: Number(transaction.tax) || 0,
            totalAmount: Number(transaction.totalAmount) || 0,
            paidAmount: Number(transaction.paidAmount) || 0,
            balance: Number(transaction.balance) || 0,
            lineItems: (transaction.lineItems ?? []).map((lineItem) => ({
              id: lineItem.id,
              itemId: lineItem.itemId,
              code: lineItem.itemCodeSnapshot ?? lineItem.item?.code ?? '',
              upcCode:
                lineItem.itemUpcCodeSnapshot ?? lineItem.item?.upcCode ?? '',
              description:
                lineItem.itemDescriptionSnapshot ??
                lineItem.item?.description ??
                '',
              itemCategoryId:
                lineItem.itemCategoryIdSnapshot ??
                lineItem.item?.itemCategoryId ??
                null,
              itemCategoryName: lineItem.itemCategoryNameSnapshot ?? null,
              quantity: lineItem.quantity,
              price: Number(lineItem.price) || 0,
              total: Number(lineItem.getLineItemTotal()) || 0,
            })),
          };
        }),
        pagination: {
          page: normalizedPage,
          limit: normalizedLimit,
          total,
          totalPages: Math.ceil(total / normalizedLimit),
        },
      },
    };
  }

  private async validateCustomerForTransaction(
    customerId: number,
    locationId: number,
    requireActive = true,
  ): Promise<string> {
    const rows = await this.posTransactionRepository.query(
      `
        SELECT user.id, profile.firstname, profile.lastname
        FROM user
        INNER JOIN user_location userLocation
          ON userLocation.user_id = user.id
          AND userLocation.location_id = ?
        INNER JOIN rbac_auth_assignment authAssignment
          ON authAssignment.user_id = CAST(user.id AS CHAR)
          AND authAssignment.item_name = 'customer'
        LEFT JOIN user_profile profile
          ON profile.user_id = user.id
        WHERE user.id = ?
          AND user.isDeleted = 0
          ${requireActive ? 'AND (user.status = 2 OR EXISTS (SELECT 1 FROM location_walkin_customer lwc WHERE lwc.customerId=user.id AND lwc.locationId=userLocation.location_id))' : ''}
        LIMIT 1
      `,
      [locationId, customerId],
    );

    if (!rows || rows.length === 0) {
      throw new BadRequestException(
        'Selected customer was not found for this location',
      );
    }

    return `${rows[0].firstname || ''} ${rows[0].lastname || ''}`.trim();
  }

  private async updateCustomerLocked(
    transactionId: number,
    dto: UpdatePosTransactionCustomerDto,
  ): Promise<PosTransaction> {
    const transaction = await this.posTransactionRepository.findOne({
      where: { id: transactionId },
      relations: ['lineItems', 'lineItems.item'],
    });

    if (!transaction) {
      throw new NotFoundException(
        `Transaction with id ${transactionId} not found`,
      );
    }

    if (transaction.status !== PosTransactionStatus.DRAFT) {
      throw new BadRequestException(
        'Cannot update customer on a non-DRAFT transaction',
      );
    }

    const customerId = dto.customerId ? Number(dto.customerId) : null;
    const customerInfo = dto.customerInfo?.trim() || null;

    if (dto.isWalkIn && customerId) {
      throw new BadRequestException(
        'Walk-in checkout cannot select a named customer',
      );
    }

    if (dto.isWalkIn) {
      transaction.customerId = null;
      transaction.customerInfo = customerInfo || 'Walk-in Customer';
      transaction.isWalkIn = true;
    } else if (customerId) {
      const customerName = await this.validateCustomerForTransaction(
        customerId,
        transaction.locationId,
      );
      transaction.customerId = customerId;
      transaction.isWalkIn = false;
      transaction.customerInfo =
        customerInfo || customerName || `Customer ${customerId}`;
    } else {
      transaction.customerId = null;
      transaction.customerInfo = customerInfo;
      transaction.isWalkIn = false;
    }

    return this.posTransactionRepository.save(transaction);
  }

  async findItemByCode(
    locationSlug: string,
    code: string,
  ): Promise<{
    id: number;
    code: string;
    upcCode: string | null;
    description: string;
    price: number;
    trackInventory: boolean;
    stockQuantity: number | null;
  }> {
    // The query parameter is kept as "code" for API compatibility, but POS scans match item.upcCode.
    const validation = this.upcValidatorService.validate(code);
    if (!validation.valid) {
      throw new BadRequestException(validation.error);
    }

    // Convert location slug to locationId
    const locationId = await this.locationService.getLocationId(locationSlug);

    const item = await this.itemRepository.findOne({
      where: {
        upcCode: code,
        locationId,
        isDeleted: false,
        status: 1,
      } as any,
    });

    if (!item) {
      throw new NotFoundException(`Item with UPC code '${code}' not found`);
    }

    const stock = await this.itemRepository.manager
      .getRepository(ItemLocationStock)
      .findOne({
        where: { itemId: item.id, locationId },
      });

    const trackInventory = stock?.trackInventory === true;

    return {
      id: item.id,
      code: item.code,
      upcCode: item.upcCode,
      description: item.description,
      price: Number(item.price),
      trackInventory,
      stockQuantity:
        trackInventory && stock.stockQuantity != null
          ? Number(stock.stockQuantity)
          : null,
    };
  }

  private async addLineItemLocked(
    transactionId: number,
    dto: AddLineItemDto,
  ): Promise<PosTransaction> {
    const transaction = await this.posTransactionRepository.findOne({
      where: { id: transactionId },
    });

    if (!transaction) {
      throw new NotFoundException(
        `Transaction with id ${transactionId} not found`,
      );
    }

    if (transaction.status !== PosTransactionStatus.DRAFT) {
      throw new BadRequestException(
        'Cannot add items to a non-DRAFT transaction',
      );
    }

    const item = await this.itemRepository.findOne({
      where: {
        id: dto.itemId,
        locationId: transaction.locationId,
        status: 1,
        isDeleted: false,
      } as any,
    });

    if (!item) {
      throw new NotFoundException(`Item with id ${dto.itemId} not found`);
    }

    if (dto.overridePrice !== undefined) {
      throw new BadRequestException(
        'Line-item price override is not available in this POS phase',
      );
    }

    const royaltySnapshot = await resolveRoyaltySnapshot(
      this.lineItemRepository.manager,
      transaction.locationId,
      item,
    );

    const lineItem = this.lineItemRepository.create({
      posTransactionId: transaction.id,
      itemId: item.id,
      quantity: dto.quantity,
      price: item.price,
      discount: dto.discount ?? 0,
      overridePrice: null,
      royaltyCategoryId: royaltySnapshot.categoryId || null,
      royaltyRateApplied: royaltySnapshot.rate,
      advertisementRateApplied: royaltySnapshot.advertisementRate,
    });

    await this.lineItemRepository.save(lineItem);

    // Return transaction after recalculation (avoids duplicate query)
    return this.recalculateTransaction(transactionId);
  }

  private roundCurrency(value: number): number {
    return RoundingUtils.roundDecimal(value || 0, 2);
  }

  private async refreshRoyaltySnapshots(
    transaction: PosTransaction,
  ): Promise<void> {
    const categoryNames = new Map<number, string>();
    const categoryName = async (id: number | null): Promise<string | null> => {
      if (!id) return null;
      if (!categoryNames.has(id)) {
        const category = await this.lineItemRepository.manager
          .getRepository(ItemCategory)
          .findOne({ where: { id } });
        categoryNames.set(id, category?.name ?? 'Uncategorized');
      }
      return categoryNames.get(id) ?? null;
    };

    for (const lineItem of transaction.lineItems ?? []) {
      const item = lineItem.item;
      if (!item) {
        throw new BadRequestException('Cannot snapshot a missing POS item');
      }
      const royaltySnapshot = await resolveRoyaltySnapshot(
        this.lineItemRepository.manager,
        transaction.locationId,
        item,
      );
      lineItem.royaltyCategoryId = royaltySnapshot.categoryId || null;
      lineItem.royaltyRateApplied = royaltySnapshot.rate;
      lineItem.advertisementRateApplied = royaltySnapshot.advertisementRate;
      lineItem.royaltyFreeSnapshot = Number(item.royaltyFree) === 1 ? 1 : 0;
      lineItem.itemCodeSnapshot = item.code;
      lineItem.itemUpcCodeSnapshot = item.upcCode;
      lineItem.itemDescriptionSnapshot = item.description;
      lineItem.itemCategoryIdSnapshot = item.itemCategoryId;
      lineItem.itemCategoryNameSnapshot = await categoryName(
        item.itemCategoryId,
      );
      lineItem.royaltyCategoryNameSnapshot = await categoryName(
        lineItem.royaltyCategoryId,
      );
    }

    if (transaction.lineItems?.length) {
      await this.lineItemRepository.save(transaction.lineItems);
    }
  }

  private async getLocationProvinceId(
    locationId: number,
  ): Promise<number | null> {
    const rows = await this.posTransactionRepository.query(
      'SELECT province_id as provinceId FROM location WHERE id = ? LIMIT 1',
      [locationId],
    );

    const provinceId = Number(rows?.[0]?.provinceId);
    return Number.isInteger(provinceId) && provinceId > 0 ? provinceId : null;
  }

  private async calculateTax(
    transaction: PosTransaction,
    subtotal: number,
  ): Promise<number> {
    const lineItems = transaction.lineItems ?? [];
    if (lineItems.length === 0 || subtotal <= 0) {
      return 0;
    }

    const provinceId = await this.getLocationProvinceId(transaction.locationId);
    if (!provinceId) {
      return 0;
    }

    const discountAmount = Math.min(
      Number(transaction.discountAmount) || 0,
      subtotal,
    );
    let tax = 0;

    for (const lineItem of lineItems) {
      const lineTotal = lineItem.getLineItemTotal();
      if (lineTotal <= 0) continue;

      const taxStatusId = Number(lineItem.item?.taxStatusId || 0);
      if (!taxStatusId) continue;

      const taxRate = await this.taxRepository.getTaxRateByTaxStatusAndProvince(
        taxStatusId,
        provinceId,
      );
      if (!taxRate) continue;

      const discountShare =
        discountAmount > 0 ? (lineTotal / subtotal) * discountAmount : 0;
      const taxableAmount = Math.max(lineTotal - discountShare, 0);
      tax += taxableAmount * (Number(taxRate) / 100);
    }

    return this.roundCurrency(tax);
  }

  private async recalculateTransaction(
    transactionId: number,
  ): Promise<PosTransaction> {
    const transaction = await this.posTransactionRepository.findOne({
      where: { id: transactionId },
      relations: ['lineItems', 'lineItems.item'],
    });

    if (!transaction) {
      throw new NotFoundException(
        `Transaction with id ${transactionId} not found`,
      );
    }
    const subtotal = (transaction.lineItems ?? []).reduce(
      (sum, item) => sum + item.getLineItemTotal(),
      0,
    );
    const discountAmount = Math.min(
      Number(transaction.discountAmount) || 0,
      subtotal,
    );
    const tax = await this.calculateTax(transaction, subtotal);
    const paidAmount = Number(transaction.paidAmount) || 0;

    transaction.subtotal = this.roundCurrency(subtotal);
    transaction.discountAmount = this.roundCurrency(discountAmount);
    transaction.tax = tax;
    transaction.totalAmount = this.roundCurrency(
      transaction.subtotal - transaction.discountAmount + tax,
    );
    transaction.balance = this.roundCurrency(
      transaction.totalAmount - paidAmount,
    );

    return await this.posTransactionRepository.save(transaction);
  }

  private async removeLineItemLocked(
    transactionId: number,
    lineItemId: number,
  ): Promise<PosTransaction> {
    const transaction = await this.posTransactionRepository.findOne({
      where: { id: transactionId },
      relations: ['lineItems'],
    });

    if (!transaction) {
      throw new NotFoundException(
        `Transaction with id ${transactionId} not found`,
      );
    }

    if (transaction.status !== PosTransactionStatus.DRAFT) {
      throw new BadRequestException(
        'Cannot remove items from a non-DRAFT transaction',
      );
    }

    const lineItem = await this.lineItemRepository.findOne({
      where: { id: lineItemId } as any,
    });

    if (!lineItem) {
      throw new NotFoundException(`Line item with id ${lineItemId} not found`);
    }

    if (lineItem.posTransactionId !== transactionId) {
      throw new BadRequestException(
        'Line item does not belong to this transaction',
      );
    }

    // Delete the line item from database
    await this.lineItemRepository.remove(lineItem);

    // Check if this was the last item and reset discount if needed
    const remainingItems = await this.lineItemRepository.count({
      where: { posTransactionId: transactionId } as any,
    });

    if (remainingItems === 0 && transaction.discountAmount > 0) {
      await this.posTransactionRepository.update(transactionId, {
        discountAmount: 0,
      });
    }

    // Return transaction after recalculation (fetches fresh data from DB)
    return this.recalculateTransaction(transactionId);
  }

  private async updateLineItemLocked(
    transactionId: number,
    lineItemId: number,
    dto: UpdateLineItemDto,
  ): Promise<PosTransaction> {
    const transaction = await this.posTransactionRepository.findOne({
      where: { id: transactionId },
    });

    if (!transaction) {
      throw new NotFoundException(
        `Transaction with id ${transactionId} not found`,
      );
    }

    if (transaction.status !== PosTransactionStatus.DRAFT) {
      throw new BadRequestException(
        'Cannot update items in a non-DRAFT transaction',
      );
    }

    const lineItem = await this.lineItemRepository.findOne({
      where: { id: lineItemId } as any,
    });

    if (!lineItem) {
      throw new NotFoundException(`Line item with id ${lineItemId} not found`);
    }

    if (lineItem.posTransactionId !== transactionId) {
      throw new BadRequestException(
        'Line item does not belong to this transaction',
      );
    }

    if (dto.quantity !== undefined) {
      lineItem.quantity = dto.quantity;
    }

    if (dto.discount !== undefined) {
      lineItem.discount = dto.discount;
    }

    if (dto.overridePrice !== undefined) {
      throw new BadRequestException(
        'Line-item price override is not available in this POS phase',
      );
    }

    await this.lineItemRepository.save(lineItem);

    // Return transaction after recalculation (avoids duplicate query)
    return this.recalculateTransaction(transactionId);
  }

  private async cancelTransactionLocked(
    id: number,
    userId?: number,
  ): Promise<PosTransaction> {
    const transaction = await this.posTransactionRepository.findOne({
      where: { id },
      relations: ['lineItems', 'lineItems.item'],
    });

    if (!transaction) {
      throw new NotFoundException(`Transaction with id ${id} not found`);
    }

    if (transaction.status === PosTransactionStatus.PAID) {
      throw new BadRequestException(
        'Cannot cancel a transaction that has already been paid',
      );
    }

    if (transaction.status === PosTransactionStatus.CANCELED) {
      throw new BadRequestException('Transaction is already cancelled');
    }

    if (transaction.status !== PosTransactionStatus.DRAFT) {
      throw new BadRequestException(
        'Cannot cancel a voided or refunded transaction',
      );
    }

    transaction.status = PosTransactionStatus.CANCELED;
    transaction.cancelledByUserId = userId || null;
    transaction.cancelledAt = new Date();
    return await this.posTransactionRepository.save(transaction);
  }

  private async deductManagedStock(transaction: PosTransaction): Promise<void> {
    const quantities = new Map<
      number,
      { quantity: number; description: string }
    >();

    for (const lineItem of transaction.lineItems ?? []) {
      const current = quantities.get(lineItem.itemId);
      quantities.set(lineItem.itemId, {
        quantity: (current?.quantity ?? 0) + Number(lineItem.quantity),
        description:
          lineItem.item?.description ||
          current?.description ||
          'Item ' + lineItem.itemId,
      });
    }

    const stockRepository =
      this.posTransactionRepository.manager.getRepository(ItemLocationStock);
    const stockRows: ItemLocationStock[] = [];
    const trackedItemIds = new Set<number>();

    // Lock rows in a stable order so simultaneous sales cannot oversell.
    for (const itemId of [...quantities.keys()].sort((a, b) => a - b)) {
      const requested = quantities.get(itemId)!;
      const stock = await stockRepository.findOne({
        where: { itemId, locationId: transaction.locationId },
        lock: { mode: 'pessimistic_write' },
      });

      // Items are unrestricted until inventory tracking is explicitly enabled.
      if (!stock?.trackInventory) continue;

      if (stock.stockQuantity == null) {
        throw new BadRequestException(
          'Stock is not configured for ' +
            requested.description +
            '; update item inventory before taking payment',
        );
      }

      const available = Number(stock.stockQuantity);
      if (available < requested.quantity) {
        throw new BadRequestException(
          'Insufficient stock for ' +
            requested.description +
            ': ' +
            available +
            ' available, ' +
            requested.quantity +
            ' requested',
        );
      }

      const before = { ...stock };
      stock.stockQuantity = available - requested.quantity;
      await queueLowStockAlert(this.posTransactionRepository.manager, before, stock);
      trackedItemIds.add(itemId);
      stockRows.push(stock);
    }

    for (const lineItem of transaction.lineItems ?? []) {
      lineItem.inventoryQuantityDeducted = trackedItemIds.has(lineItem.itemId)
        ? Number(lineItem.quantity)
        : 0;
    }

    if (stockRows.length > 0) {
      await stockRepository.save(stockRows);
    }
  }

  private async restoreManagedStock(
    transaction: PosTransaction,
  ): Promise<void> {
    const quantities = new Map<number, number>();
    for (const lineItem of transaction.lineItems ?? []) {
      const deducted = Number(lineItem.inventoryQuantityDeducted) || 0;
      if (deducted <= 0) continue;
      quantities.set(
        lineItem.itemId,
        (quantities.get(lineItem.itemId) ?? 0) + deducted,
      );
    }

    const stockRepository =
      this.posTransactionRepository.manager.getRepository(ItemLocationStock);
    const stockRows: ItemLocationStock[] = [];
    for (const itemId of [...quantities.keys()].sort((a, b) => a - b)) {
      const stock = await stockRepository.findOne({
        where: { itemId, locationId: transaction.locationId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!stock || stock.stockQuantity == null) {
        throw new BadRequestException(
          'Cannot reverse this sale because its inventory record is missing',
        );
      }
      stock.stockQuantity =
        Number(stock.stockQuantity) + Number(quantities.get(itemId));
      stockRows.push(stock);
    }

    if (stockRows.length > 0) {
      await stockRepository.save(stockRows);
    }
  }

  private async reverseTransactionLocked(
    transactionId: number,
    dto: ReversePosTransactionDto,
    userId: number,
  ): Promise<PosTransaction> {
    const manager = this.posTransactionRepository.manager;
    const transaction = await this.loadTransaction(transactionId);
    if (transaction.status !== PosTransactionStatus.PAID) {
      throw new BadRequestException(
        'Only a paid POS transaction can be voided or refunded',
      );
    }

    const reason = dto.reason?.trim();
    if (!reason) {
      throw new BadRequestException('A reversal reason is required');
    }

    const payment = await manager.getRepository(Payment).findOne({
      where: { id: transaction.paymentId! },
      lock: { mode: 'pessimistic_write' },
    });
    if (!payment || Number(payment.isDeleted) === 1) {
      throw new BadRequestException(
        'The POS payment is unavailable and cannot be reversed',
      );
    }

    // Legacy payment fields store Eastern wall-clock values, while POS audit
    // timestamps represent actual instants like paidAt. Keep both conventions
    // explicit so reversal history remains chronological in every timezone.
    const reversalPaymentDate = getCurrentESTDate();
    const reversedAt = new Date();
    if (
      dto.type === PosTransactionReversalType.VOID &&
      new Date(payment.date).toISOString().slice(0, 10) !==
        reversalPaymentDate.toISOString().slice(0, 10)
    ) {
      throw new BadRequestException(
        'Only a payment recorded today can be voided. Record a refund instead.',
      );
    }

    await this.restoreManagedStock(transaction);

    if (dto.type === PosTransactionReversalType.VOID) {
      payment.isDeleted = 1;
      payment.updatedByUserId = userId;
      await manager.save(Payment, payment);
      transaction.status = PosTransactionStatus.VOIDED;
    } else {
      // A refund is an auditable counter-entry dated when the refund occurs.
      // Keep the original payment intact so historical payment and royalty
      // reports can recognize the sale and reversal in their own periods.
      const paymentTransactionId =
        await this.receivePaymentRepository.createTransaction(userId, manager);
      const refundPayment = await this.receivePaymentRepository.createPayment(
        {
          transactionId: paymentTransactionId,
          userId: payment.userId,
          paymentMethodId: payment.paymentMethodId,
          amount: -Math.abs(Number(payment.amount)),
          balance: 0,
          date: reversalPaymentDate,
          reference: (
            'Refund ' + (payment.reference || transaction.transactionId)
          ).slice(0, 255),
          notes:
            'POS refund for ' +
            transaction.transactionId +
            '. Reason: ' +
            reason,
          createdByUserId: userId,
          updatedByUserId: userId,
        },
        manager,
      );
      transaction.refundPaymentId = refundPayment.id;
      transaction.status = PosTransactionStatus.REFUNDED;
    }

    transaction.reversalType = dto.type;
    transaction.reversalReason = reason;
    transaction.reversedByUserId = userId;
    transaction.reversedAt = reversedAt;
    await this.posTransactionRepository.save(transaction);

    if (!transaction.isWalkIn && transaction.customerId) {
      await this.customerBalanceRecalculatorService.recalculateAndPersist(
        transaction.customerId,
        { manager, updatedByUserId: userId },
      );
    }

    return this.loadTransaction(transaction.id);
  }

  private async processPaymentLocked(
    dto: ProcessPaymentDto,
    userId: number,
  ): Promise<PosTransaction> {
    const manager = this.posTransactionRepository.manager;
    const transaction = await this.loadTransaction(dto.transactionId);
    if (transaction.status === PosTransactionStatus.PAID) {
      // A retry after a lost response must not create a second payment.
      const payment = await manager
        .getRepository(Payment)
        .findOne({ where: { id: transaction.paymentId! } });
      if (
        !payment ||
        payment.isDeleted ||
        Number(payment.amount) !== Number(dto.amount) ||
        Number(payment.paymentMethodId) !== Number(dto.paymentMethodId) ||
        (dto.paymentId !== undefined && dto.paymentId !== transaction.paymentId)
      ) {
        throw new BadRequestException(
          'POS transaction already paid with different payment details',
        );
      }
      return transaction;
    }
    if (transaction.status !== PosTransactionStatus.DRAFT)
      throw new BadRequestException('Cannot pay a non-DRAFT transaction');
    if (transaction.paymentId || Number(transaction.paidAmount) !== 0)
      throw new BadRequestException(
        'Transaction already has a payment; review it before continuing',
      );
    let checkoutCustomerId = transaction.customerId;
    if (transaction.isWalkIn) {
      if (dto.paymentId !== undefined) {
        throw new BadRequestException(
          'Walk-in checkout requires a new payment',
        );
      }
      const walkInCustomer = await manager
        .getRepository(LocationWalkinCustomer)
        .findOne({ where: { locationId: transaction.locationId } });
      if (!walkInCustomer) {
        throw new BadRequestException(
          'Walk-in customer is not configured for this location',
        );
      }
      checkoutCustomerId = walkInCustomer.customerId;
    }
    if (!checkoutCustomerId)
      throw new BadRequestException(
        'Select a customer or choose walk-in checkout before taking payment',
      );
    try {
      // Location setup intentionally creates the mapped walk-in placeholder as
      // inactive. Named customers must still be active; both paths retain the
      // location, role, and soft-delete checks above.
      await this.validateCustomerForTransaction(
        checkoutCustomerId,
        transaction.locationId,
        !transaction.isWalkIn,
      );
    } catch (error) {
      if (transaction.isWalkIn && error instanceof BadRequestException) {
        throw new BadRequestException(
          'Walk-in customer is not configured for this location',
        );
      }
      throw error;
    }
    if (!transaction.lineItems.length)
      throw new BadRequestException('Cannot pay a transaction with no items');
    for (const line of transaction.lineItems) {
      if (
        !line.item ||
        line.item.isDeleted ||
        Number(line.item.status) !== 1 ||
        line.item.locationId !== transaction.locationId
      ) {
        throw new BadRequestException(
          'An item is inactive or unavailable for this location; update the cart',
        );
      }
    }
    const recalculated = await this.recalculateTransaction(transaction.id);
    if (
      !Number.isFinite(dto.amount) ||
      dto.amount <= 0 ||
      dto.amount !== this.roundCurrency(dto.amount) ||
      this.roundCurrency(dto.amount) !== Number(recalculated.totalAmount)
    ) {
      throw new BadRequestException(
        'Payment amount must equal the current POS total',
      );
    }
    const method = await manager.getRepository(PaymentMethod).findOne({
      where: { id: dto.paymentMethodId, active: 1, displayed: 1 },
    });
    if (
      !method ||
      [
        PaymentMethod.TYPE_CREDIT_USED,
        PaymentMethod.TYPE_CREDIT_APPLIED,
        PaymentMethod.TYPE_APPLY_CREDIT,
      ].includes(method.id)
    ) {
      throw new BadRequestException(
        'Select an active payment method; existing credit cannot be used for POS',
      );
    }

    recalculated.customerId = checkoutCustomerId;
    if (transaction.isWalkIn) {
      recalculated.customerInfo =
        transaction.customerInfo || 'Walk-in Customer';
    }

    await this.deductManagedStock(recalculated);

    let payment: Payment;
    if (dto.paymentId !== undefined) {
      // Rolling-deployment compatibility: accept only an unallocated payment
      // owned by this customer, never an already spent or shared payment.
      const existing = await manager.getRepository(Payment).findOne({
        where: { id: dto.paymentId },
        lock: { mode: 'pessimistic_write' },
      });
      const linked = await this.posTransactionRepository.findOne({
        where: { paymentId: dto.paymentId },
      });
      const allocations = await manager.query(
        'SELECT (SELECT COUNT(*) FROM invoice_payment WHERE payment_id = ? AND isDeleted = 0) + (SELECT COUNT(*) FROM lesson_payment WHERE paymentId = ? AND isDeleted = 0) AS count',
        [dto.paymentId, dto.paymentId],
      );
      if (
        !existing ||
        existing.isDeleted ||
        existing.userId !== checkoutCustomerId ||
        Number(existing.amount) !== dto.amount ||
        Number(existing.balance) !== dto.amount ||
        existing.paymentMethodId !== dto.paymentMethodId ||
        linked ||
        Number(allocations[0].count) > 0
      ) {
        throw new BadRequestException(
          'Payment is unavailable or does not match this POS sale',
        );
      }
      existing.balance = 0;
      existing.updatedByUserId = userId;
      payment = await manager.save(Payment, existing);
    } else {
      const paymentTransactionId =
        await this.receivePaymentRepository.createTransaction(userId, manager);
      payment = await this.receivePaymentRepository.createPayment(
        {
          transactionId: paymentTransactionId,
          userId: checkoutCustomerId,
          paymentMethodId: dto.paymentMethodId,
          amount: dto.amount,
          balance: 0,
          date: getCurrentESTDate(),
          reference: dto.reference || '',
          notes: dto.notes || '',
          createdByUserId: userId,
          updatedByUserId: userId,
        },
        manager,
      );
    }
    await this.refreshRoyaltySnapshots(recalculated);
    recalculated.paymentId = payment.id;
    recalculated.paidAmount = dto.amount;
    recalculated.balance = 0;
    recalculated.status = PosTransactionStatus.PAID;
    recalculated.soldByUserId = userId;
    recalculated.paidAt = new Date();
    await this.posTransactionRepository.save(recalculated);
    if (!transaction.isWalkIn) {
      await this.customerBalanceRecalculatorService.recalculateAndPersist(
        checkoutCustomerId,
        { manager, updatedByUserId: userId },
      );
    }
    return this.loadTransaction(transaction.id);
  }

  private async applyDiscountLocked(
    transactionId: number,
    discountAmount: number,
  ): Promise<PosTransaction> {
    const transaction = await this.posTransactionRepository.findOne({
      where: { id: transactionId },
      relations: ['lineItems'],
    });

    if (!transaction) {
      throw new NotFoundException(
        `Transaction with id ${transactionId} not found`,
      );
    }

    if (transaction.status !== PosTransactionStatus.DRAFT) {
      throw new BadRequestException(
        'Cannot apply discount to a non-DRAFT transaction',
      );
    }

    const subtotal = (transaction.lineItems ?? []).reduce(
      (sum, item) => sum + item.getLineItemTotal(),
      0,
    );

    if (discountAmount > subtotal) {
      throw new BadRequestException(
        'Discount cannot exceed the transaction subtotal',
      );
    }

    transaction.discountAmount = discountAmount;

    await this.posTransactionRepository.save(transaction);

    return this.recalculateTransaction(transactionId);
  }
}
