import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { Invoice } from '../entities/invoice.entity';
import { InvoiceLineItem } from '../entities/invoice-line-item.entity';
import { InvoiceLineItemDiscount } from '../entities/invoice-line-item-discount.entity';
import { InvoiceReverse } from '../entities/invoice-reverse.entity';
import { InvoicePayment } from '../entities/invoice-payment.entity';
import { Payment } from '../../payment/entities/payment.entity';
import { CreditUsage } from '../../payment/entities/credit-usage.entity';
import { PaymentMethod } from '../../payment/entities/payment-method.entity';
import { ItemTypeEnum } from '../enums/item-type.enum';
import { getCurrentESTDate } from '../../utils/date-utils';
import { RoundingUtils } from '../../utils/rounding.utils';
import { InvoiceDiscountCalculator } from '../services/calculations/invoice-discount.calculator';

/**
 * Repository for Return (Revert) Invoice operations.
 * All methods accept an EntityManager to participate in the service-level transaction.
 *
 * Matches legacy PHP actionRevertInvoice($id) in InvoiceController.php (lines 556-603)
 */
@Injectable()
export class InvoiceReturnRepository {
  constructor(
    private readonly discountCalculator: InvoiceDiscountCalculator,
  ) {}

  // ──────────────────────────────────────────────
  // Validation & Queries
  // ──────────────────────────────────────────────

  /**
   * Find an invoice by ID scoped to location.
   * Matches legacy findModel($id) (lines 506-523) — location_id + isDeleted=false
   */
  async findInvoiceById(
    locationId: number,
    invoiceId: number,
    manager: EntityManager,
  ): Promise<Invoice | null> {
    return manager
      .createQueryBuilder(Invoice, 'invoice')
      .where('invoice.id = :invoiceId', { invoiceId })
      .andWhere('invoice.location_id = :locationId', { locationId })
      .andWhere('invoice.isDeleted = :isDeleted', { isDeleted: false })
      .getOne();
  }

  /**
   * Check if this invoice is itself a reversed (credit) invoice.
   * Matches legacy isReversedInvoice() — checks invoice_reverse.reversedInvoiceId = invoiceId
   */
  async isReversedInvoice(
    invoiceId: number,
    manager: EntityManager,
  ): Promise<boolean> {
    const count = await manager
      .createQueryBuilder(InvoiceReverse, 'ir')
      .where('ir.reversedInvoiceId = :invoiceId', { invoiceId })
      .getCount();
    return count > 0;
  }

  /**
   * Check if this invoice has already been reversed by another invoice.
   * Matches legacy isInvoiceReversed() — checks invoice_reverse.invoiceId = invoiceId
   */
  async isInvoiceReversed(
    invoiceId: number,
    manager: EntityManager,
  ): Promise<boolean> {
    const count = await manager
      .createQueryBuilder(InvoiceReverse, 'ir')
      .where('ir.invoiceId = :invoiceId', { invoiceId })
      .getCount();
    return count > 0;
  }

  /**
   * Get the first non-deleted line item's item_type_id for canRevert checks.
   * Used to check isOpeningBalance() and isPaymentCreditInvoice().
   */
  async getFirstLineItemTypeId(
    invoiceId: number,
    manager: EntityManager,
  ): Promise<number | null> {
    const lineItem = await manager
      .createQueryBuilder(InvoiceLineItem, 'ili')
      .select('ili.itemTypeId')
      .where('ili.invoiceId = :invoiceId', { invoiceId })
      .andWhere('ili.isDeleted = :isDeleted', { isDeleted: false })
      .orderBy('ili.id', 'ASC')
      .getOne();
    return lineItem?.itemTypeId ?? null;
  }

  /**
   * Get all non-deleted line items for the invoice, including their discounts.
   * Matches legacy $invoice->lineItems (with notDeleted condition)
   */
  async getLineItemsWithDiscounts(
    invoiceId: number,
    manager: EntityManager,
  ): Promise<InvoiceLineItem[]> {
    return manager
      .createQueryBuilder(InvoiceLineItem, 'ili')
      .leftJoinAndSelect('ili.discounts', 'discount')
      .where('ili.invoiceId = :invoiceId', { invoiceId })
      .andWhere('ili.isDeleted = :isDeleted', { isDeleted: false })
      .getMany();
  }

  /**
   * Get the next invoice number for a location + type combination.
   * Matches legacy Invoice::beforeSave (lines 877-882):
   *   $lastInvoice = Invoice::find()->andWhere([location_id, type])->orderBy(['id' => SORT_DESC])->one()
   *   $invoiceNumber = $lastInvoice ? $lastInvoice->invoice_number + 1 : 1
   */
  async getNextInvoiceNumber(
    locationId: number,
    type: number,
    manager: EntityManager,
  ): Promise<number> {
    await manager.query('SELECT id FROM location WHERE id=? FOR UPDATE', [locationId]);
    const last = await manager
      .createQueryBuilder(Invoice, 'invoice')
      .where('invoice.location_id = :locationId', { locationId })
      .andWhere('invoice.type = :type', { type })
      // A locking read sees commits made after this transaction's first read.
      // The location lock alone does not refresh MySQL REPEATABLE READ snapshots.
      .setLock('pessimistic_write')
      .orderBy('invoice.id', 'DESC')
      .getOne();
    return last ? last.invoiceNumber + 1 : 1;
  }

  // ──────────────────────────────────────────────
  // Create Operations
  // ──────────────────────────────────────────────

  /**
   * Insert a row into the `transaction` table and return the generated ID.
   * Matches legacy Invoice::beforeSave → $transaction = new Transaction(); $transaction->save();
   * Uses raw insert (same pattern as generate-invoice.repository.ts lines 132-153)
   */
  async createTransaction(
    currentUserId: number,
    manager: EntityManager,
  ): Promise<number> {
    const result = await manager
      .createQueryBuilder()
      .insert()
      .into('transaction')
      .values({
        createdOn: getCurrentESTDate(),
        updatedOn: getCurrentESTDate(),
        createdByUserId: currentUserId,
        updatedByUserId: currentUserId,
      })
      .execute();

    const transactionId = result.identifiers?.[0]?.id
      ?? result.raw?.insertId
      ?? result.generatedMaps?.[0]?.id;

    if (!transactionId) {
      throw new Error('Could not get transaction ID from insert result');
    }

    return transactionId;
  }

  /**
   * Create the new credit invoice.
   * Matches legacy actionRevertInvoice lines 559-565:
   *   - Copies user_id, location_id from original
   *   - Sets type = TYPE_INVOICE
   *   - Invoice::beforeSave($insert=true) auto-sets: transactionId, invoice_number, date, status=PAID, etc.
   *
   * In NestJS we set these explicitly since there's no beforeSave hook.
   */
  async createCreditInvoice(
    originalInvoice: Invoice,
    transactionId: number,
    invoiceNumber: number,
    currentUserId: number,
    manager: EntityManager,
  ): Promise<Invoice> {
    const creditInvoice = manager.create(Invoice, {
      transactionId,
      userId: originalInvoice.userId,
      walkinBuyerName: originalInvoice.walkinBuyerName,
      locationId: originalInvoice.locationId,
      invoiceNumber,
      date: getCurrentESTDate(), // Today's date (matches legacy: date('Y-m-d'))
      type: Invoice.TYPE_INVOICE,
      subTotal: 0,
      tax: 0,
      total: 0,
      balance: 0,
      status: Invoice.STATUS_PAID,     // Matches legacy beforeSave: STATUS_PAID on insert
      isSent: false,
      isDeleted: false,
      isTaxAdjusted: 0,
      isCanceled: false,
      isPosted: 0,
      isVoid: 0,
      paidStatus: 0,
      totalCopy: 0,
      createdUserId: currentUserId,
      updatedUserId: currentUserId,
    });
    await manager.save(Invoice, creditInvoice);
    return creditInvoice;
  }

  /**
   * Create the invoice_reverse linking record.
   * Matches legacy actionRevertInvoice lines 566-569:
   *   $invoiceReverse->invoiceId = $invoice->id
   *   $invoiceReverse->reversedInvoiceId = $creditInvoice->id
   */
  async createInvoiceReverse(
    originalInvoiceId: number,
    creditInvoiceId: number,
    manager: EntityManager,
  ): Promise<InvoiceReverse> {
    const invoiceReverse = manager.create(InvoiceReverse, {
      invoiceId: originalInvoiceId,
      reversedInvoiceId: creditInvoiceId,
    });
    await manager.save(InvoiceReverse, invoiceReverse);
    return invoiceReverse;
  }

  /**
   * Clone a single line item with negated unit.
   * Matches legacy actionRevertInvoice lines 570-578:
   *   - Clones all fields from original
   *   - Sets invoice_id = credit invoice ID
   *   - Sets unit = -(unit) — NEGATE
   *
   * Legacy behavior notes:
   *   - insert path sets tax fields from item.taxStatusId chain (not copied from original line item)
   *   - initial netTotal is grossPrice (before discounts are cloned)
   *   - taxRate = netTotal * taxCodeRate / 100
   */
  async cloneLineItem(
    originalLineItem: InvoiceLineItem,
    creditInvoiceId: number,
    manager: EntityManager,
  ): Promise<InvoiceLineItem> {
    const negatedUnit = -Number(originalLineItem.unit);
    const grossPrice = this.getGrossPrice(
      Number(originalLineItem.amount),
      negatedUnit,
      originalLineItem.itemTypeId,
    );

    const taxData = await this.getTaxDataForItem(
      originalLineItem.itemId,
      manager,
    );

    const taxStatus = taxData?.taxStatusName ?? originalLineItem.taxStatus;
    const taxType = taxData?.taxTypeName ?? originalLineItem.taxType;
    const taxCode = taxData?.taxCodeCode ?? originalLineItem.taxCode;
    const taxCodeRate = taxData?.taxCodeRate ?? this.getTaxRatePercentFallback(originalLineItem);

    const initialTaxRate = RoundingUtils.roundHalfUp((grossPrice * taxCodeRate) / 100, 4);

    const newLineItem = manager.create(InvoiceLineItem, {
      isPos: originalLineItem.isPos,
      posSnapshot: originalLineItem.posSnapshot,
      returnedFromLineItemId: originalLineItem.isPos ? originalLineItem.id : null,
      inventoryQuantityDeducted: 0,
      returnedQuantity: 0,
      itemId: originalLineItem.itemId,
      invoiceId: creditInvoiceId,
      itemTypeId: originalLineItem.itemTypeId,
      unit: negatedUnit,
      amount: originalLineItem.amount,   // Rate stays the same
      description: originalLineItem.description,
      royaltyFree: originalLineItem.royaltyFree,
      royaltyCategoryId: originalLineItem.royaltyCategoryId,
      royaltyRateApplied: originalLineItem.royaltyRateApplied,
      advertisementRateApplied: originalLineItem.advertisementRateApplied,
      taxType: originalLineItem.isPos ? originalLineItem.taxType : taxType,
      taxRate: originalLineItem.isPos ? -Number(originalLineItem.taxRate) : initialTaxRate,
      taxStatus: originalLineItem.isPos ? originalLineItem.taxStatus : taxStatus,
      taxCode: originalLineItem.isPos ? originalLineItem.taxCode : taxCode,
      code: originalLineItem.code,
      cost: originalLineItem.cost,
      rate: originalLineItem.rate,
      isDeleted: false,
      netTotal: originalLineItem.isPos ? -Number(originalLineItem.netTotal) : grossPrice,
    });
    await manager.save(InvoiceLineItem, newLineItem);
    return newLineItem;
  }

  /**
   * Clone a single discount to a new line item.
   * Matches legacy actionRevertInvoice lines 579-584:
   *   - Clones value, valueType, type
   *   - Sets invoiceLineItemId = new line item ID
   */
  async cloneDiscount(
    originalDiscount: InvoiceLineItemDiscount,
    newLineItemId: number,
    manager: EntityManager,
  ): Promise<InvoiceLineItemDiscount> {
    const newDiscount = manager.create(InvoiceLineItemDiscount, {
      invoiceLineItemId: newLineItemId,
      value: originalDiscount.value,
      valueType: originalDiscount.valueType,
      type: originalDiscount.type,
    });
    await manager.save(InvoiceLineItemDiscount, newDiscount);
    return newDiscount;
  }

  /**
   * Recalculate one cloned line item's netTotal/taxRate after all discounts are cloned.
   * Mirrors legacy discount->afterSave() → lineItem->save() effect.
   */
  async recalculateClonedLineItemTotals(
    lineItemId: number,
    creditInvoiceId: number,
    manager: EntityManager,
  ): Promise<void> {
    const [lineItem, creditInvoice] = await Promise.all([
      manager.findOne(InvoiceLineItem, {
        where: { id: lineItemId },
        relations: ['discounts'],
      }),
      manager.findOne(Invoice, { where: { id: creditInvoiceId } }),
    ]);

    if (!lineItem || !creditInvoice) {
      return;
    }

    if (lineItem.isPos && lineItem.returnedFromLineItemId) return;

    const discount = this.discountCalculator.calculateLineItemDiscount(
      lineItem,
      creditInvoice,
    );
    const grossPrice = this.getGrossPrice(
      Number(lineItem.amount),
      Number(lineItem.unit),
      lineItem.itemTypeId,
    );
    const netTotal = RoundingUtils.roundHalfUp(grossPrice - discount, 4);

    const taxData = await this.getTaxDataByStatusName(lineItem.taxStatus, manager);
    const taxCodeRate = taxData?.taxCodeRate ?? this.getTaxRatePercentFallback(lineItem);

    lineItem.netTotal = netTotal;
    lineItem.taxRate = RoundingUtils.roundHalfUp((netTotal * taxCodeRate) / 100, 4);
    if (taxData) {
      lineItem.taxType = taxData.taxTypeName;
      lineItem.taxCode = taxData.taxCodeCode;
    }

    await manager.save(InvoiceLineItem, lineItem);
  }

  private getGrossPrice(
    amount: number,
    unit: number,
    itemTypeId: number,
  ): number {
    if (itemTypeId === ItemTypeEnum.TYPE_GROUP_LESSON) {
      return RoundingUtils.roundHalfUp(amount, 2);
    }
    return RoundingUtils.roundHalfUp(amount * unit, 2);
  }

  private getTaxRatePercentFallback(lineItem: InvoiceLineItem): number {
    const netTotal = Number(lineItem.netTotal);
    if (!netTotal) {
      return 0;
    }
    return (Number(lineItem.taxRate) / netTotal) * 100;
  }

  private async getTaxDataForItem(
    itemId: number,
    manager: EntityManager,
  ): Promise<{
    taxStatusName: string;
    taxTypeName: string;
    taxCodeRate: number;
    taxCodeCode: string;
  } | null> {
    const result = await manager
      .createQueryBuilder()
      .select('ts.name', 'taxStatusName')
      .addSelect('tt.name', 'taxTypeName')
      .addSelect('tc.rate', 'taxCodeRate')
      .addSelect('tc.code', 'taxCodeCode')
      .from('item', 'i')
      .innerJoin('tax_status', 'ts', 'ts.id = i.taxStatusId')
      .innerJoin('tax_type_tax_status_assoc', 'ttsa', 'ttsa.tax_status_id = ts.id')
      .innerJoin('tax_type', 'tt', 'tt.id = ttsa.tax_type_id')
      .innerJoin('tax_code', 'tc', 'tc.tax_type_id = tt.id')
      .where('i.id = :itemId', { itemId })
      .getRawOne();

    if (!result) {
      return null;
    }

    return {
      taxStatusName: result.taxStatusName,
      taxTypeName: result.taxTypeName,
      taxCodeRate: parseFloat(result.taxCodeRate) || 0,
      taxCodeCode: result.taxCodeCode,
    };
  }

  private async getTaxDataByStatusName(
    taxStatusName: string,
    manager: EntityManager,
  ): Promise<{
    taxTypeName: string;
    taxCodeRate: number;
    taxCodeCode: string;
  } | null> {
    const result = await manager
      .createQueryBuilder()
      .select('tt.name', 'taxTypeName')
      .addSelect('tc.rate', 'taxCodeRate')
      .addSelect('tc.code', 'taxCodeCode')
      .from('tax_status', 'ts')
      .innerJoin('tax_type_tax_status_assoc', 'ttsa', 'ttsa.tax_status_id = ts.id')
      .innerJoin('tax_type', 'tt', 'tt.id = ttsa.tax_type_id')
      .innerJoin('tax_code', 'tc', 'tc.tax_type_id = tt.id')
      .where('ts.name = :taxStatusName', { taxStatusName })
      .getRawOne();

    if (!result) {
      return null;
    }

    return {
      taxTypeName: result.taxTypeName,
      taxCodeRate: parseFloat(result.taxCodeRate) || 0,
      taxCodeCode: result.taxCodeCode,
    };
  }

  // ──────────────────────────────────────────────
  // Recalculation
  // ──────────────────────────────────────────────

  /**
   * Recalculate invoice totals from its line items and payments.
   * Matches legacy Invoice::beforeSave($insert=false) (lines 895-913):
   *   subTotal = sum of lineItems' netTotal (netPrice)
   *   tax = sum of lineItems' tax_rate (unless isTaxAdjusted)
   *   total = subTotal + tax
   *   invoicePaymentTotal = sum of invoice_payment.amount (where not deleted)
   *   status = getInvoiceStatus()
   *   balance = invoiceBalance
   */
  async recalculateInvoiceTotals(
    invoiceId: number,
    currentUserId: number,
    manager: EntityManager,
  ): Promise<Invoice> {
    // Get line item sums
    const lineItemSums = await manager
      .createQueryBuilder(InvoiceLineItem, 'ili')
      .select('COALESCE(SUM(ili.netTotal), 0)', 'netSubtotal')
      .addSelect('COALESCE(SUM(ili.taxRate), 0)', 'lineItemTax')
      .where('ili.invoiceId = :invoiceId', { invoiceId })
      .andWhere('ili.isDeleted = :isDeleted', { isDeleted: false })
      .getRawOne();

    const subTotal = parseFloat(lineItemSums?.netSubtotal || '0');
    const lineItemTax = parseFloat(lineItemSums?.lineItemTax || '0');

    // Get the current invoice to check isTaxAdjusted
    const invoice = await manager.findOne(Invoice, { where: { id: invoiceId } });
    if (!invoice) {
      throw new Error(`Invoice ${invoiceId} not found during recalculation`);
    }

    // Tax: use lineItemTax unless isTaxAdjusted (matches legacy line 905-907)
    const tax = invoice.isTaxAdjusted ? Number(invoice.tax) : lineItemTax;
    const total = RoundingUtils.roundDecimal(subTotal + tax, 4);

    // Get payment total
    const paymentSum = await manager
      .createQueryBuilder(InvoicePayment, 'ip')
      .select('COALESCE(SUM(ip.amount), 0)', 'paidTotal')
      .where('ip.invoiceId = :invoiceId', { invoiceId })
      .andWhere('ip.isDeleted = :isDeleted', { isDeleted: 0 })
      .getRawOne();

    const invoicePaymentTotal = parseFloat(paymentSum?.paidTotal || '0');

    // Compute status (matches legacy Invoice::getInvoiceStatus lines 841-866)
    const roundedTotal = RoundingUtils.roundDecimal(total, 2);
    const roundedPaid = RoundingUtils.roundDecimal(invoicePaymentTotal, 2);
    const status = this.resolveInvoiceStatus(roundedTotal, roundedPaid);

    // Compute balance (matches legacy Invoice::getInvoiceBalance lines 704-713)
    // Credit invoices (non-invoice type) use special formula:
    //   balance = -invoiceAppliedPaymentTotal - creditUsedPaymentTotal
    // Regular invoices use: balance = total - paymentTotal
    let balance: number;

    if (invoice.type !== Invoice.TYPE_INVOICE) {
      // Credit invoices: get applied payments (excluding credit-used) and credit-used payments separately
      const appliedPaymentsResult = await manager
        .createQueryBuilder(InvoicePayment, 'ip')
        .innerJoin(Payment, 'p', 'p.id = ip.paymentId')
        .where('ip.invoiceId = :invoiceId', { invoiceId })
        .andWhere('ip.isDeleted = :isDeleted', { isDeleted: 0 })
        .andWhere('p.isDeleted = :pDeleted', { pDeleted: 0 })
        .andWhere('p.paymentMethodId != :creditUsed', {
          creditUsed: PaymentMethod.TYPE_CREDIT_USED,
        })
        .select('COALESCE(SUM(ip.amount), 0)', 'total')
        .getRawOne();

      const creditUsedResult = await manager
        .createQueryBuilder(InvoicePayment, 'ip')
        .innerJoin(Payment, 'p', 'p.id = ip.paymentId')
        .where('ip.invoiceId = :invoiceId', { invoiceId })
        .andWhere('ip.isDeleted = :isDeleted', { isDeleted: 0 })
        .andWhere('p.isDeleted = :pDeleted', { pDeleted: 0 })
        .andWhere('p.paymentMethodId = :creditUsed', {
          creditUsed: PaymentMethod.TYPE_CREDIT_USED,
        })
        .select('COALESCE(SUM(ip.amount), 0)', 'total')
        .getRawOne();

      const appliedPayments = parseFloat(appliedPaymentsResult?.total || '0') || 0;
      const creditUsed = parseFloat(creditUsedResult?.total || '0') || 0;

      // Legacy formula for credit invoices: -(appliedPayments + creditUsed)
      balance = -RoundingUtils.roundDecimal(appliedPayments + creditUsed, 4);
    } else {
      // Regular invoices: total - paymentTotal
      balance = roundedPaid === roundedTotal
        ? 0
        : RoundingUtils.roundDecimal(total - invoicePaymentTotal, 4);
    }

    // MySQL decimal columns are returned as strings. Avoid a no-op save (and a
    // false audit diff such as "31.2500" -> 31.25) when the numeric values are
    // already equivalent. Real financial, status, or actor changes still save.
    const numericValueChanged = (current: unknown, next: number): boolean => {
      if (current === null || current === undefined || current === '') {
        return true;
      }

      const currentNumber = Number(current);
      return !Number.isFinite(currentNumber) || currentNumber !== Number(next);
    };

    const hasChanges =
      numericValueChanged(invoice.subTotal, subTotal) ||
      numericValueChanged(invoice.tax, tax) ||
      numericValueChanged(invoice.total, total) ||
      numericValueChanged(invoice.balance, balance) ||
      numericValueChanged(invoice.status, status) ||
      Number(invoice.updatedUserId) !== currentUserId;

    if (hasChanges) {
      invoice.subTotal = subTotal;
      invoice.tax = tax;
      invoice.total = total;
      invoice.status = status;
      invoice.balance = balance;
      invoice.updatedUserId = currentUserId;
      await manager.save(Invoice, invoice);
    }

    return invoice;
  }

  // ──────────────────────────────────────────────
  // Payment Pair (addPayment logic)
  // ──────────────────────────────────────────────

  /**
   * Create the credit-applied / credit-used payment pair.
   * Matches legacy Payable::addPayment($creditInvoice, $payment) called as:
   *   $invoice->addPayment($creditInvoice, $payment)
   * Where $this = original invoice, $from = credit invoice
   *
   * Creates:
   *   1. Payment #1 (Credit-Applied): positive amount, linked to ORIGINAL invoice
   *   2. InvoicePayment #1: links payment #1 → original invoice
   *   3. Payment #2 (Credit-Used): negative amount, linked to CREDIT invoice
   *   4. InvoicePayment #2: links payment #2 → credit invoice
   *   5. CreditUsage: links payment #1 ↔ payment #2
   *
   * Also mimics Payment::beforeSave side effects:
   *   - Creates transaction record for each payment
   *   - Sets isDeleted=false, date=now
   *   - Credit-Used payment: amount = -abs(amount)
   */
  async createPaymentPair(
    originalInvoice: Invoice,
    creditInvoice: Invoice,
    amount: number,
    customerId: number,
    currentUserId: number,
    manager: EntityManager,
  ): Promise<void> {
    const now = getCurrentESTDate();

    // Format invoice numbers for references (matches legacy getInvoiceNumber())
    // 'I-' + str_pad(invoice_number, 5, '0', STR_PAD_LEFT)
    const creditInvoiceNumber = `I-${String(creditInvoice.invoiceNumber).padStart(5, '0')}`;
    const originalInvoiceNumber = `I-${String(originalInvoice.invoiceNumber).padStart(5, '0')}`;

    // ── Payment #1: Credit-Applied (positive, on original invoice) ──
    // Matches Payable.php lines 78-103
    const transactionId1 = await this.createTransaction(currentUserId, manager);

    const creditAppliedPayment = manager.create(Payment, {
      transactionId: transactionId1,
      userId: customerId,
      paymentMethodId: PaymentMethod.TYPE_CREDIT_APPLIED,   // 3
      amount: RoundingUtils.roundDecimal(amount, 4),
      balance: RoundingUtils.roundDecimal(amount, 4),
      date: now,
      reference: creditInvoiceNumber,    // Reference to credit invoice (matches Payable.php line 100)
      notes: '',
      isDeleted: 0,
      createdByUserId: currentUserId,
      updatedByUserId: currentUserId,
    });
    await manager.save(Payment, creditAppliedPayment);

    // InvoicePayment #1: links credit-applied payment → original invoice
    // Matches Payment::afterSave lines 386-391
    const invoicePayment1 = manager.create(InvoicePayment, {
      invoiceId: originalInvoice.id,
      paymentId: creditAppliedPayment.id,
      amount: RoundingUtils.roundDecimal(amount, 4),
      isDeleted: 0,
      date: now,
      createdByUserId: currentUserId,
      updatedByUserId: currentUserId,
    });
    await manager.save(InvoicePayment, invoicePayment1);

    // ── Payment #2: Credit-Used (negative, on credit invoice) ──
    // Matches Payable.php lines 104-132
    const transactionId2 = await this.createTransaction(currentUserId, manager);

    const negativeAmount = -Math.abs(amount);

    const creditUsedPayment = manager.create(Payment, {
      transactionId: transactionId2,
      userId: customerId,
      paymentMethodId: PaymentMethod.TYPE_CREDIT_USED,   // 2
      amount: RoundingUtils.roundDecimal(negativeAmount, 4),
      balance: RoundingUtils.roundDecimal(negativeAmount, 4),
      date: now,
      reference: originalInvoiceNumber,   // Reference to original invoice (matches Payable.php lines 126-130)
      notes: '',
      isDeleted: 0,
      createdByUserId: currentUserId,
      updatedByUserId: currentUserId,
    });
    await manager.save(Payment, creditUsedPayment);

    // InvoicePayment #2: links credit-used payment → credit invoice
    const invoicePayment2 = manager.create(InvoicePayment, {
      invoiceId: creditInvoice.id,
      paymentId: creditUsedPayment.id,
      amount: RoundingUtils.roundDecimal(negativeAmount, 4),
      isDeleted: 0,
      date: now,
      createdByUserId: currentUserId,
      updatedByUserId: currentUserId,
    });
    await manager.save(InvoicePayment, invoicePayment2);

    // ── CreditUsage: link payment pair ──
    // Matches Payable.php lines 134
    const creditUsage = manager.create(CreditUsage, {
      creditPaymentId: creditAppliedPayment.id,
      debitPaymentId: creditUsedPayment.id,
    });
    await manager.save(CreditUsage, creditUsage);
  }

  // ──────────────────────────────────────────────
  // Update original invoice
  // ──────────────────────────────────────────────

  /**
   * Mark the original invoice as canceled.
   * Matches legacy actionRevertInvoice lines 599-600:
   *   $invoice->isCanceled = true; $invoice->save();
   *
   * The save() triggers beforeSave($insert=false) which recalculates totals.
   */
  async markOriginalAsCanceled(
    invoiceId: number,
    currentUserId: number,
    manager: EntityManager,
  ): Promise<void> {
    const invoice = await manager.findOne(Invoice, { where: { id: invoiceId } });
    if (invoice) {
      invoice.isCanceled = true;
      invoice.updatedUserId = currentUserId;
      await manager.save(Invoice, invoice);
    }
  }

  /**
   * Get paid amount for an invoice (sum of non-deleted invoice_payment amounts).
   * Used for balance/status recalculation.
   */
  async getInvoicePaidAmount(
    invoiceId: number,
    manager: EntityManager,
  ): Promise<number> {
    const result = await manager
      .createQueryBuilder(InvoicePayment, 'ip')
      .select('COALESCE(SUM(ip.amount), 0)', 'total')
      .where('ip.invoiceId = :invoiceId', { invoiceId })
      .andWhere('ip.isDeleted = :isDeleted', { isDeleted: 0 })
      .getRawOne();
    return parseFloat(result?.total || '0');
  }

  /**
   * Determine invoice status from rounded total and paid amounts.
   * Matches legacy Invoice::getInvoiceStatus (lines 841-866)
   * and follows the same pattern as InvoiceDetailsEditTransformationService.calculateNewStatus
   */
  private resolveInvoiceStatus(roundedTotal: number, roundedPaid: number): number {
    if (roundedTotal === roundedPaid) return Invoice.STATUS_PAID;
    if (roundedTotal > roundedPaid) return Invoice.STATUS_OWING;
    return Invoice.STATUS_CREDIT;
  }
}
