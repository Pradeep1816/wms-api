import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager, In } from 'typeorm';
import { Invoice } from '../entities/invoice.entity';
import { InvoiceLineItem } from '../entities/invoice-line-item.entity';
import { InvoiceLineItemDiscount } from '../entities/invoice-line-item-discount.entity';
import { Item } from '../../item/entities/item.entity';
import { ItemCategory } from '../../item/entities/item-category.entity';
import { CustomerDiscount } from '../../customer/entities/customer-discount.entity';
import { InvoiceLineItemCreateRepository } from '../repositories/invoice-line-item-create.repository';
import { InvoiceLineItemCreateTransformationService } from './transformations/invoice-line-item-create-transformation.service';
import { InvoicePosStockService } from './invoice-pos-stock.service';
import { CustomerBalanceRecalculatorService } from '../../shared/services/customer-balance-recalculator.service';
import { InvoiceLineItemUpdateTransformationService } from './transformations/invoice-line-item-update-transformation.service';
import { resolveRoyaltySnapshot } from '../../utils/royality/royalty-calculation.util';
import { UpdateLineItemRequestDto } from '../dto/update-invoice-line-item-request.dto';

@Injectable()
export class InvoicePosLinesService {
  constructor(
    private readonly db: DataSource,
    private readonly pricing: InvoiceLineItemCreateTransformationService,
    private readonly stock: InvoicePosStockService,
    private readonly balances: CustomerBalanceRecalculatorService,
    private readonly legacyUpdate: InvoiceLineItemUpdateTransformationService,
  ) {}

  repository(manager: EntityManager) {
    return new InvoiceLineItemCreateRepository(
      manager.getRepository(Invoice),
      manager.getRepository(InvoiceLineItem),
      manager.getRepository(InvoiceLineItemDiscount),
      manager.getRepository(Item),
      manager.getRepository(CustomerDiscount),
    );
  }

  async lockInvoice(
    manager: EntityManager,
    locationId: number,
    invoiceId: number,
  ) {
    const invoice = await manager.findOne(Invoice, {
      where: { id: invoiceId, locationId, isDeleted: false },
      lock: { mode: 'pessimistic_write' },
    });
    if (!invoice)
      throw new NotFoundException('Invoice not found in this location.');
    return invoice;
  }

  async assertEditable(manager: EntityManager, invoice: Invoice) {
    if (
      invoice.type !== Invoice.TYPE_INVOICE ||
      invoice.isPosted ||
      invoice.isVoid ||
      invoice.isCanceled
    ) {
      throw new BadRequestException(
        'POS items require an open, editable invoice.',
      );
    }
    const payments = await manager.query<Array<{ id: number }>>(
      'SELECT ip.id FROM invoice_payment ip INNER JOIN payment p ON p.id=ip.payment_id AND p.isDeleted=0 WHERE ip.invoice_id=? AND ip.isDeleted=0 AND ip.amount<>0 LIMIT 1',
      [invoice.id],
    );
    const returns = await manager.query<Array<{ id: number }>>(
      'SELECT id FROM invoice_reverse WHERE invoiceId=? OR reversedInvoiceId=? LIMIT 1',
      [invoice.id, invoice.id],
    );
    if (
      payments.length ||
      returns.length ||
      (await manager
        .createQueryBuilder(InvoiceLineItem, 'li')
        .where(
          'li.invoiceId=:id AND (li.returnedQuantity>0 OR li.returnedFromLineItemId IS NOT NULL)',
          { id: invoice.id },
        )
        .getCount())
    ) {
      throw new BadRequestException(
        'This invoice has payments or returns. Create a new invoice for additional purchases; use Return POS Items for goods being returned.',
      );
    }
  }

  /** The same location catalog item has the same source for scan/manual entry. */
  isCatalogPurchase(item: Item, locationId: number) {
    // Codes/descriptions are school-entered text (a book may be called LESSON).
    // Actual lesson charges originate from the lesson service and retain their
    // lesson itemTypeId; adding a local catalog item manually is a POS purchase.
    return Number(item.locationId) === locationId;
  }

  async add(
    locationId: number,
    locationSlug: string,
    invoiceId: number,
    itemId: number,
    quantity: number,
    userId: number,
  ) {
    return this.db.transaction(async (manager) => {
      this.audit(manager, userId);
      const invoice = await this.lockInvoice(manager, locationId, invoiceId);
      await this.assertEditable(manager, invoice);
      const line = await this.addInTransaction(
        manager,
        invoice,
        itemId,
        quantity,
      );
      await this.recalculate(manager, invoice, locationSlug, userId);
      return { id: line.id };
    });
  }

  async addInTransaction(
    manager: EntityManager,
    invoice: Invoice,
    itemId: number,
    quantity: number,
    applyCustomerDiscount = true,
  ) {
    if (!Number.isSafeInteger(quantity) || quantity < 1)
      throw new BadRequestException(
        'POS quantity must be a positive whole number.',
      );
    const item = await manager.findOne(Item, {
      where: {
        id: itemId,
        locationId: invoice.locationId,
        isDeleted: false,
        status: 1,
      },
    });
    if (!item)
      throw new NotFoundException('Item is unavailable in this location.');
    const repository = this.repository(manager);
    const [tax] = await manager.query<
      Array<{
        taxStatusName: string;
        taxTypeName: string;
        taxCodeRate: number;
        taxCodeCode: string;
      }>
    >(
      `SELECT ts.name AS taxStatusName, tt.name AS taxTypeName, tc.rate AS taxCodeRate, tc.code AS taxCodeCode
      FROM tax_status ts INNER JOIN tax_type_tax_status_assoc a ON a.tax_status_id=ts.id
      INNER JOIN tax_type tt ON tt.id=a.tax_type_id
      INNER JOIN tax_code tc ON tc.tax_type_id=tt.id
      INNER JOIN location l ON l.province_id=tc.province_id
      WHERE ts.id=? AND l.id=? ORDER BY tc.id DESC LIMIT 1`,
      [item.taxStatusId, invoice.locationId],
    );
    if (!tax)
      throw new BadRequestException(
        'Tax configuration is missing for this item.',
      );
    const royalty = await repository.getRoyaltySnapshot(
      invoice.locationId,
      item,
    );
    const category = await manager.findOne(ItemCategory, {
      where: { id: item.itemCategoryId },
    });
    const line = this.pricing.buildNewLineItem(invoice, item, tax, royalty);
    Object.assign(line, {
      isPos: true,
      unit: quantity,
      inventoryQuantityDeducted: 0,
      returnedQuantity: 0,
      posSnapshot: {
        code: item.code,
        upcCode: item.upcCode,
        description: item.description,
        categoryId: item.itemCategoryId,
        categoryName: category?.name ?? 'Uncategorized',
        taxPercent: tax.taxCodeRate,
      },
    });
    if (!Number.isFinite(Number(line.amount)) || Number(line.amount) < 0)
      throw new BadRequestException('POS item price must be zero or greater.');
    await this.stock.changeQuantity(
      manager,
      invoice.locationId,
      line,
      0,
      quantity,
    );
    // Separate saves deliberately retain each scan's current price/category/rates.
    // Merging by itemId alone would erase differences after a catalog edit.
    await repository.saveLineItem(line);
    const discount = applyCustomerDiscount
      ? await repository.getCustomerDiscount(invoice.userId)
      : null;
    if (discount?.value != null)
      line.discounts = [
        await repository.createCustomerDiscount(line.id, discount.value),
      ];
    this.priceLine(line, invoice);
    return repository.saveLineItem(line);
  }

  async change(
    locationId: number,
    locationSlug: string,
    lineId: number,
    dto: UpdateLineItemRequestDto | null,
    userId: number,
  ) {
    return this.db.transaction(async (manager) => {
      this.audit(manager, userId);
      const reference = await manager.findOneBy(InvoiceLineItem, {
        id: lineId,
        isDeleted: false,
      });
      if (!reference)
        throw new NotFoundException('POS invoice item not found.');
      const invoice = await this.lockInvoice(
        manager,
        locationId,
        reference.invoiceId,
      );
      await this.assertEditable(manager, invoice);
      const line = await manager.findOneOrFail(InvoiceLineItem, {
        where: { id: lineId, isDeleted: false },
        relations: ['discounts'],
      });
      if (!line.isPos) {
        // Mixed invoices use the existing lesson calculation, under the same
        // invoice lock as payment/returns. Recalculate other lines from snapshots.
        if (dto) {
          const [tax] = await manager.query<
            Array<{ taxTypeName: string; taxCodeRate: number }>
          >(
            `SELECT tt.name AS taxTypeName, tc.rate AS taxCodeRate
            FROM tax_status ts INNER JOIN tax_type_tax_status_assoc a ON a.tax_status_id=ts.id
            INNER JOIN tax_type tt ON tt.id=a.tax_type_id INNER JOIN tax_code tc ON tc.tax_type_id=tt.id
            INNER JOIN location l ON l.province_id=tc.province_id
            WHERE ts.name=? AND l.id=? ORDER BY tc.id DESC LIMIT 1`,
            [line.taxStatus, locationId],
          );
          const result = this.legacyUpdate.transformLineItemCalculation(
            line,
            dto,
            tax,
            [line],
            invoice,
            Number(line.taxRate),
            0,
            false,
          );
          if (result.validationError)
            throw new BadRequestException(result.validationError);
          Object.assign(line, result.updateFields);
          if (dto.royaltyFree !== undefined) {
            const snapshot = await resolveRoyaltySnapshot(
              manager,
              locationId,
              line.itemId,
              dto.royaltyFree,
            );
            Object.assign(line, {
              royaltyCategoryId: snapshot.categoryId || null,
              royaltyRateApplied: snapshot.rate,
              advertisementRateApplied: snapshot.advertisementRate,
            });
          }
        } else line.isDeleted = true;
        await manager.save(InvoiceLineItem, line);
        await this.recalculate(manager, invoice, locationSlug, userId);
        return { id: line.id };
      }
      const quantity = dto ? Number(dto.unit) : 0;
      if (
        dto &&
        (!Number.isSafeInteger(quantity) ||
          quantity < 1 ||
          !Number.isFinite(dto.amount) ||
          dto.amount < 0)
      ) {
        throw new BadRequestException(
          'POS quantity must be a positive whole number and price must be zero or greater.',
        );
      }
      if (
        dto?.royaltyFree !== undefined &&
        Number(dto.royaltyFree) !== Number(line.royaltyFree)
      ) {
        throw new BadRequestException(
          'Royalty-free status is captured on creation. Remove this unpaid item and add it again to use updated catalog settings.',
        );
      }
      await this.stock.changeQuantity(
        manager,
        locationId,
        line,
        Number(line.unit),
        quantity,
      );
      if (dto) {
        Object.assign(line, {
          unit: quantity,
          amount: dto.amount,
          description: dto.description.trim(),
          cost: dto.cost ?? line.cost,
        });
        this.priceLine(line, invoice);
      } else line.isDeleted = true;
      await manager.save(InvoiceLineItem, line);
      await this.recalculate(manager, invoice, locationSlug, userId);
      return { id: line.id };
    });
  }

  async recalculate(
    manager: EntityManager,
    invoice: Invoice,
    locationSlug: string,
    userId: number,
  ) {
    const repository = this.repository(manager);
    const totals = this.pricing.transformCreateTotals(
      await repository.getLineItemsWithDiscounts(invoice.id),
      invoice,
      await repository.getLineItemTaxSum(invoice.id),
      await repository.getInvoicePaidAmount(invoice.id),
    );
    await repository.updateInvoiceTotals(
      invoice,
      totals.newSubTotal,
      totals.newTax,
      totals.newTotal,
      totals.newBalance,
      totals.newStatus,
      userId,
    );
    await this.balances.recalculateAndPersist(invoice.userId, {
      manager,
      locationSlug,
      updatedByUserId: userId,
    });
  }

  priceLine(line: InvoiceLineItem, invoice: Invoice) {
    this.pricing.refreshLineItemPricing(
      line,
      invoice,
      Number(line.posSnapshot?.taxPercent || 0),
    );
    if (Number(line.netTotal) < 0)
      throw new BadRequestException(
        'Discount cannot exceed the POS item price.',
      );
    return line;
  }

  audit(manager: EntityManager, userId: number) {
    if (manager.queryRunner)
      manager.queryRunner.data = {
        ...manager.queryRunner.data,
        currentUserId: userId,
      };
  }

  async refreshCustomerBalance(
    manager: EntityManager,
    customerId: number,
    locationSlug: string,
    userId: number,
  ) {
    await this.balances.recalculateAndPersist(customerId, {
      manager,
      locationSlug,
      updatedByUserId: userId,
    });
  }

  async hasPos(invoiceId: number) {
    return this.db
      .getRepository(InvoiceLineItem)
      .existsBy({ invoiceId, isPos: true, isDeleted: false });
  }

  async editTax(
    locationId: number,
    slug: string,
    ids: number[],
    taxStatus: string,
    userId: number,
  ) {
    return this.db.transaction(async (manager) => {
      this.audit(manager, userId);
      const references = await manager.findBy(InvoiceLineItem, {
        id: In(ids),
        isDeleted: false,
      });
      if (references.length !== new Set(ids).size)
        throw new NotFoundException('Invoice items not found.');
      const invoices = new Map<number, Invoice>();
      for (const id of [
        ...new Set(references.map((line) => line.invoiceId)),
      ].sort((a, b) => a - b)) {
        const invoice = await this.lockInvoice(manager, locationId, id);
        await this.assertEditable(manager, invoice);
        invoices.set(id, invoice);
      }
      const [tax] = await manager.query<
        Array<{ taxType: string; percent: number; taxCode: string }>
      >(
        `SELECT tt.name AS taxType, tc.rate AS percent, tc.code AS taxCode
        FROM tax_status ts INNER JOIN tax_type_tax_status_assoc a ON a.tax_status_id=ts.id
        INNER JOIN tax_type tt ON tt.id=a.tax_type_id INNER JOIN tax_code tc ON tc.tax_type_id=tt.id
        INNER JOIN location l ON l.province_id=tc.province_id
        WHERE ts.name=? AND l.id=? ORDER BY tc.id DESC LIMIT 1`,
        [taxStatus, locationId],
      );
      if (!tax)
        throw new BadRequestException(
          'Tax configuration not found for this location.',
        );
      for (const line of await manager.find(InvoiceLineItem, {
        where: { id: In(ids), isDeleted: false },
        relations: ['discounts'],
      })) {
        Object.assign(line, {
          taxStatus,
          taxType: tax.taxType,
          taxCode: tax.taxCode,
        });
        if (line.isPos && line.posSnapshot)
          line.posSnapshot = {
            ...line.posSnapshot,
            taxPercent: Number(tax.percent),
          };
        // Preserve the saved net amount, including lesson rounding and discounts.
        line.taxRate = (Number(line.netTotal) * Number(tax.percent)) / 100;
        await manager.save(InvoiceLineItem, line);
      }
      for (const invoice of invoices.values()) {
        invoice.isTaxAdjusted = 0;
        await manager.update(Invoice, invoice.id, { isTaxAdjusted: 0 });
        await this.recalculate(manager, invoice, slug, userId);
      }
      return { count: references.length, rate: Number(tax.percent) };
    });
  }
}
