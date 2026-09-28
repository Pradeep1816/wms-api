import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Invoice } from '../../invoice/entities/invoice.entity';
import { InvoiceLineItem } from '../../invoice/entities/invoice-line-item.entity';

@Injectable()
export class DiscountsReportRepository {
  constructor(
    @InjectRepository(InvoiceLineItem) private readonly invoiceLineItemRepo: Repository<InvoiceLineItem>,
  ) {}

  async getDiscountReportData(
    locationId: number,
    fromDateIso: string,
    toDateIso: string,
  ): Promise<any[]> {

    // Discount cascade (matches legacy InvoiceLineItem::getDiscount):
    // 1) Start from gross price (group lessons use amount, others use amount * unit)
    // 2) Subtract multi-enrolment ($)
    // 3) Subtract line item (%, or $)
    // 4) Subtract group (%, or $)
    // 5) Subtract customer (%) if not an equipment rental contract
    // 6) Subtract enrolment payment frequency (%)
    // The final net price and the total discount are derived from these steps.
   

    
    const grossPriceExpr = `CASE WHEN invoiceLineItem.itemTypeId = 2 THEN invoiceLineItem.amount ELSE invoiceLineItem.amount * invoiceLineItem.unit END`;
    
    // Pull discount components by type from invoice_line_item_discount
    // Types: 1=Customer(%), 2=Payment Frequency(%), 3=Multi-Enrol($), 4=Line Item(%/$), 5=Group(%/$)
  
    const multiEnrolmentDiscountValue = `COALESCE((SELECT d.value FROM invoice_line_item_discount d WHERE d.invoiceLineItemId = invoiceLineItem.id AND d.type = 3 LIMIT 1), 0)`;
    const lineItemDiscountValue = `COALESCE((SELECT d.value FROM invoice_line_item_discount d WHERE d.invoiceLineItemId = invoiceLineItem.id AND d.type = 4 LIMIT 1), 0)`;
    const lineItemDiscountValueType = `COALESCE((SELECT d.valueType FROM invoice_line_item_discount d WHERE d.invoiceLineItemId = invoiceLineItem.id AND d.type = 4 LIMIT 1), 0)`;
    const groupDiscountValue = `COALESCE((SELECT d.value FROM invoice_line_item_discount d WHERE d.invoiceLineItemId = invoiceLineItem.id AND d.type = 5 LIMIT 1), 0)`;
    const groupDiscountValueType = `COALESCE((SELECT d.valueType FROM invoice_line_item_discount d WHERE d.invoiceLineItemId = invoiceLineItem.id AND d.type = 5 LIMIT 1), 0)`;
    const customerDiscountValue = `COALESCE((SELECT d.value FROM invoice_line_item_discount d WHERE d.invoiceLineItemId = invoiceLineItem.id AND d.type = 1 LIMIT 1), 0)`;
    const customerDiscountValueType = `COALESCE((SELECT d.valueType FROM invoice_line_item_discount d WHERE d.invoiceLineItemId = invoiceLineItem.id AND d.type = 1 LIMIT 1), 0)`;
    const enrolmentPaymentFreqDiscountValue = `COALESCE((SELECT d.value FROM invoice_line_item_discount d WHERE d.invoiceLineItemId = invoiceLineItem.id AND d.type = 2 LIMIT 1), 0)`;
    const afterMultiEnrolment = `(${grossPriceExpr} - ${multiEnrolmentDiscountValue})`;
    // itemDollar calculation matches legacy InvoiceLineItem::getLineItemDiscountValue()
    // if valueType=1 (percentage), return percentage value itself; if valueType=0 (dollar), return (value/100)*lineItemPrice
    const lineItemDiscountAmount = `CASE WHEN ${lineItemDiscountValueType} = 1 THEN (${lineItemDiscountValue} / 100.0) * ${afterMultiEnrolment} ELSE ${lineItemDiscountValue} END`;
    const itemDollarValue = `CASE WHEN ${lineItemDiscountValueType} = 1 THEN ${lineItemDiscountValue} ELSE (${lineItemDiscountValue} / 100.0) * ${afterMultiEnrolment} END`;
    const afterLineItem = `(${afterMultiEnrolment} - ${lineItemDiscountAmount})`;
    const groupDiscountAmount = `CASE WHEN ${groupDiscountValueType} = 1 THEN (${groupDiscountValue} / 100.0) * ${afterLineItem} ELSE ${groupDiscountValue} END`;
    const afterGroup = `(${afterLineItem} - ${groupDiscountAmount})`;
    const customerDiscountAmount = `CASE WHEN invoice.isEquipmentRentalContract = false THEN CASE WHEN ${customerDiscountValueType} = 1 THEN (${customerDiscountValue} / 100.0) * ${afterGroup} ELSE ${customerDiscountValue} END ELSE 0 END`;
    const afterCustomer = `(${afterGroup} - ${customerDiscountAmount})`;
    const enrolmentPaymentFreqDiscountAmount = `(${enrolmentPaymentFreqDiscountValue} / 100.0) * ${afterCustomer}`;
    const netPriceExpr = `(${afterCustomer} - ${enrolmentPaymentFreqDiscountAmount})`;
    const totalDiscountExpr = `(${grossPriceExpr} - ${netPriceExpr})`;

    const studentCountSubquery = `(SELECT COUNT(DISTINCT student.id) FROM student WHERE student.customer_id = invoice.user_id AND student.isDeleted = false)`;
    // Primary email subquery
    const primaryEmailSubquery = `(SELECT user_email.email FROM user_email 
      INNER JOIN user_contact ON user_email.userContactId = user_contact.id 
      WHERE user_contact.userId = invoice.user_id 
      AND user_contact.isPrimary = 1 
      AND user_contact.isDeleted = 0 
      AND user_email.isDeleted = 0 
      ORDER BY user_email.id ASC 
      LIMIT 1)`;  // Get the primary email for the customer if firstName and lastName are not available

    return this.invoiceLineItemRepo
      .createQueryBuilder('invoiceLineItem')
      .leftJoin('invoiceLineItem.invoice', 'invoice')
      .leftJoin('invoiceLineItem.item', 'item')
      .leftJoin('user', 'user', 'user.id = invoice.user_id')
      .leftJoin('user_profile', 'profile', 'profile.user_id = user.id')
      .leftJoin('invoice_item_enrolment', 'invoiceItemEnrolment', 'invoiceItemEnrolment.invoiceLineItemId = invoiceLineItem.id')
      .leftJoin('enrolment', 'enrolment1', 'enrolment1.id = invoiceItemEnrolment.enrolmentId')
      .leftJoin('payment_frequency', 'paymentFrequency1', 'paymentFrequency1.id = enrolment1.paymentFrequencyId')
      .leftJoin('invoice_item_payment_cycle_lesson', 'invoiceItemPaymentCycleLesson', 'invoiceItemPaymentCycleLesson.invoiceLineItemId = invoiceLineItem.id')
      .leftJoin('payment_cycle_lesson', 'paymentCycleLesson', 'paymentCycleLesson.id = invoiceItemPaymentCycleLesson.paymentCycleLessonId')
      .leftJoin('payment_cycle', 'paymentCycle', 'paymentCycle.id = paymentCycleLesson.paymentCycleId')
      .leftJoin('enrolment', 'enrolment2', 'enrolment2.id = paymentCycle.enrolmentId')
      .leftJoin('payment_frequency', 'paymentFrequency2', 'paymentFrequency2.id = enrolment2.paymentFrequencyId')
      .leftJoin('invoice_item_lesson', 'invoiceItemLesson', 'invoiceItemLesson.invoiceLineItemId = invoiceLineItem.id')
      .leftJoin('lesson', 'lesson', 'lesson.id = invoiceItemLesson.lessonId')
      .leftJoin('enrolment', 'enrolment3', 'enrolment3.courseId = lesson.courseId')
      .leftJoin('payment_frequency', 'paymentFrequency3', 'paymentFrequency3.id = enrolment3.paymentFrequencyId')
      .leftJoin('invoice_reverse', 'reverseInvoice', 'reverseInvoice.reversedInvoiceId = invoice.id')
      .where('invoiceLineItem.isDeleted = false')
      .andWhere('invoice.isDeleted = false')
      .andWhere('invoice.isCanceled = false')
      .andWhere('reverseInvoice.id IS NULL')
      .andWhere('invoice.type = :type', { type: Invoice.TYPE_INVOICE })
      .andWhere('invoice.locationId = :locationId', { locationId })
      .andWhere('DATE(invoice.date) BETWEEN :fromDate AND :toDate', {
        fromDate: fromDateIso,
        toDate: toDateIso,
      })
      .andWhere(`EXISTS (SELECT 1 FROM invoice_line_item_discount d WHERE d.invoiceLineItemId = invoiceLineItem.id AND d.value != 0) `)
      .groupBy('invoiceLineItem.id')
      .addGroupBy('invoice.id')
      .addGroupBy('invoice.userId')
      .addGroupBy('profile.firstname')
      .addGroupBy('profile.lastname')
      .addGroupBy('user.username')
      .addGroupBy('item.code')
      .addGroupBy('invoiceLineItem.description')
      .addGroupBy('invoiceLineItem.unit')
      .addGroupBy('invoiceLineItem.taxRate')
      .addGroupBy('invoiceLineItem.amount')
      .addGroupBy('invoiceLineItem.itemTypeId')
      .addGroupBy('invoice.isEquipmentRentalContract')
      .select([
        'invoiceLineItem.id AS id',
        'invoice.id AS invoiceId',
        'invoice.userId AS customerId',
        `COALESCE(NULLIF(TRIM(CONCAT(COALESCE(profile.firstname, ''), ' ', COALESCE(profile.lastname, ''))), ''), NULLIF(user.username, ''), ${primaryEmailSubquery}) AS customerNameBase`,
        `${studentCountSubquery} AS studentCount`,
        'item.code AS code',
        'invoiceLineItem.description AS description',
        'invoiceLineItem.unit AS qty',
        'COALESCE(MAX(paymentFrequency1.name), MAX(paymentFrequency2.name), MAX(paymentFrequency3.name)) AS paymentFrequency',
        `${grossPriceExpr} AS grossPrice`,
        `${netPriceExpr} AS netPrice`,
        'invoiceLineItem.taxRate AS tax',
        `(${netPriceExpr} + invoiceLineItem.taxRate) AS price`,
        `${enrolmentPaymentFreqDiscountValue} AS pfPercent`,
        `${multiEnrolmentDiscountValue} AS enrolDollar`,
        `${customerDiscountValue} AS customerPercent`,
        `${itemDollarValue} AS itemDollar`,
        `${totalDiscountExpr} AS netDiscount`,
      ])
      .orderBy('invoice.user_id', 'ASC')
      .getRawMany();
  }
}


