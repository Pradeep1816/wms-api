import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { PaymentMethod } from '../../payment/entities/payment-method.entity';
import { RoundingUtils } from '../../utils/rounding.utils';

export interface PaymentBasedRoyaltyRow {
  locationId: number;
  categoryId: number;
  categoryName: string;
  type: string;
  rate: number;
  advertisementRate?: number;
  advertisement?: number;
  /** Revenue whose advertisement was backfilled, not captured at payment time. */
  historicalAdvertisementRevenue?: number;
  historicalAdvertisementFreeRevenue?: number;
  royaltyFree: boolean;
  revenue: number;
  royalty: number;
}

export interface PaymentBasedRoyaltyAmounts {
  locationId: number;
  tax: number;
  posTax: number;
  royaltyFree: number;
}

export interface PaymentBasedRoyaltyData {
  categoryRows: PaymentBasedRoyaltyRow[];
  amounts: PaymentBasedRoyaltyAmounts[];
}

interface PaymentBasedRoyaltyRawRow {
  locationId: string | number;
  categoryId: string | number | null;
  categoryName: string | null;
  type: string | null;
  rate: string | number | null;
  advertisementRate?: string | number | null;
  advertisement?: string | number | null;
  historicalAdvertisementRevenue?: string | number | null;
  historicalAdvertisementFreeRevenue?: string | number | null;
  royaltyFree: string | number | boolean | null;
  revenue: string | number | null;
  royalty: string | number | null;
}

interface PaymentBasedRoyaltyAmountsRawRow {
  locationId: string | number;
  tax: string | number | null;
  posTax?: string | number | null;
  royaltyFree: string | number | null;
}

const EXCLUDED_PAYMENT_METHODS = [
  PaymentMethod.TYPE_ACCOUNT_ENTRY,
  PaymentMethod.TYPE_CREDIT_USED,
  PaymentMethod.TYPE_CREDIT_APPLIED,
  PaymentMethod.TYPE_GIFT_CARD,
];

@Injectable()
export class PaymentBasedRoyaltyReportRepository {
  constructor(private readonly dataSource: DataSource) {}

  async getPaymentBasedRoyaltyData(
    locationIds: number[],
    startDate: string,
    endDate: string,
    includePOS = true,
  ): Promise<PaymentBasedRoyaltyData> {
    return getPaymentBasedRoyaltyData(
      this.dataSource.manager,
      locationIds,
      startDate,
      endDate,
      includePOS,
    );
  }
}

async function getPaymentBasedRoyaltyData(
  manager: EntityManager,
  locationIds: number[],
  startDate: string,
  endDate: string,
  includePOS: boolean,
): Promise<PaymentBasedRoyaltyData> {
  if (locationIds.length === 0) {
    return { categoryRows: [], amounts: [] };
  }

  const locationPlaceholders = locationIds.map(() => '?').join(', ');
  const methodPlaceholders = EXCLUDED_PAYMENT_METHODS.map(() => '?').join(', ');
  const includePOSValue = includePOS ? 1 : 0;
  const scopeParameters = () => [
    ...locationIds,
    ...EXCLUDED_PAYMENT_METHODS,
    startDate,
    endDate,
  ];
  const invoiceRevenue =
    'lineItem.netTotal * ABS(invoicePayment.amount) / NULLIF(ABS(invoice.total), 0)';
  const returnRevenue =
    'returnLine.netTotal * ABS(originalInvoicePayment.amount) / NULLIF(ABS(originalInvoice.total), 0)';
  const lessonBillingTotal = `
    COALESCE(
      NULLIF(ABS(groupLesson.total), 0),
      NULLIF(ABS(privateLesson.total), 0),
      NULLIF(ABS(lesson.total), 0)
    )
  `;
  const lessonRevenue = `
    CASE
      WHEN (${lessonBillingTotal}) IS NULL
        AND ABS(COALESCE(lesson.tax, 0)) < 0.005
      THEN lessonPayment.amount
      ELSE
        lessonPayment.amount
        * GREATEST((${lessonBillingTotal}) - ABS(COALESCE(lesson.tax, 0)), 0)
        / NULLIF(${lessonBillingTotal}, 0)
    END
  `;
  const posRevenue = `
    ((COALESCE(posLine.overridePrice, posLine.price) * posLine.quantity) - posLine.discount)
    - CASE
        WHEN pos.subtotal > 0 THEN
          (((COALESCE(posLine.overridePrice, posLine.price) * posLine.quantity) - posLine.discount) / pos.subtotal)
          * pos.discountAmount
        ELSE 0
      END
  `;

  // Preserve the original sale in its payment period and recognize a refund
  // as a separate negative event on the refund payment date. Same-day voids
  // soft-delete the only payment and therefore produce no report event.
  const posEvents = `
    SELECT id AS posId, paymentId AS eventPaymentId, 1 AS direction
    FROM pos_transaction
    WHERE status IN ('PAID', 'REFUNDED')
    UNION ALL
    SELECT id AS posId, refundPaymentId AS eventPaymentId, -1 AS direction
    FROM pos_transaction
    WHERE status = 'REFUNDED' AND refundPaymentId IS NOT NULL
  `;

  // Only a POS_TRANSACTION ledger row supersedes checkout snapshots. Older
  // POS payments can have a generic PAYMENT_RECEIVED row whose category, tax
  // and gross amount do not represent the saved POS line details.
  const categorySql = `
    SELECT
      recognized.locationId,
      recognized.categoryId,
      recognized.categoryName,
      recognized.type,
      recognized.rate,
      recognized.advertisementRate,
      recognized.royaltyFree,
      COALESCE(SUM(recognized.revenue), 0) AS revenue,
      COALESCE(SUM(recognized.royalty), 0) AS royalty,
      COALESCE(SUM(CASE WHEN recognized.advertisementCalculationVersion >= 2 THEN recognized.advertisement ELSE 0 END), 0) AS advertisement,
      COALESCE(SUM(CASE WHEN recognized.advertisementCalculationVersion = 1 THEN recognized.revenue ELSE 0 END), 0) AS historicalAdvertisementRevenue,
      COALESCE(SUM(CASE WHEN recognized.advertisementCalculationVersion = 1 AND recognized.royaltyFree = 1 THEN recognized.revenue ELSE 0 END), 0) AS historicalAdvertisementFreeRevenue
    FROM (
      SELECT
        invoice.location_id AS locationId,
        COALESCE(lineItem.royaltyCategoryId, item.itemCategoryId, 0) AS categoryId,
        COALESCE(JSON_UNQUOTE(JSON_EXTRACT(lineItem.posSnapshot, '$.categoryName')), category.name, 'Uncategorized') AS categoryName,
        CASE WHEN ${includePOSValue}=1 AND lineItem.isPos=1 THEN 'POS' ELSE 'Invoice' END AS type,
        invoicePaymentRecord.advertisementCalculationVersion,
        CASE WHEN COALESCE(lineItem.royaltyFree, 0) = 1
          THEN 0 ELSE COALESCE(lineItem.royaltyRateApplied, 0) END AS rate,
        CASE WHEN COALESCE(lineItem.royaltyFree, 0) = 1 THEN 0 ELSE COALESCE(lineItem.advertisementRateApplied, 0) END AS advertisementRate,
        COALESCE(lineItem.royaltyFree, 0) AS royaltyFree,
        ${invoiceRevenue} AS revenue,
        CASE WHEN COALESCE(lineItem.royaltyFree, 0) = 1
          THEN 0
          ELSE (${invoiceRevenue}) * COALESCE(lineItem.royaltyRateApplied, 0) / 100
        END AS royalty,
        CASE WHEN COALESCE(lineItem.royaltyFree, 0) = 1 THEN 0 ELSE (${invoiceRevenue}) * COALESCE(lineItem.advertisementRateApplied, 0) / 100 END AS advertisement
      FROM invoice_line_item lineItem
      INNER JOIN invoice ON invoice.id = lineItem.invoice_id
      INNER JOIN invoice_payment invoicePayment
        ON invoicePayment.invoice_id = invoice.id AND invoicePayment.isDeleted = 0
      INNER JOIN payment invoicePaymentRecord
        ON invoicePaymentRecord.id = invoicePayment.payment_id AND invoicePaymentRecord.isDeleted = 0
      INNER JOIN item ON item.id = lineItem.item_id
      LEFT JOIN item_category category
        ON category.id = COALESCE(lineItem.royaltyCategoryId, item.itemCategoryId)
      LEFT JOIN invoice_reverse reversedInvoice
        ON reversedInvoice.reversedInvoiceId = invoice.id

      WHERE invoice.location_id IN (${locationPlaceholders})
        AND invoice.type = 2
        AND invoice.isDeleted = 0
        AND lineItem.isDeleted = 0
        AND reversedInvoice.id IS NULL
        AND (invoice.isCanceled = 0 OR EXISTS (SELECT 1 FROM invoice_reverse originalReturn WHERE originalReturn.invoiceId=invoice.id))
        AND invoicePaymentRecord.payment_method_id NOT IN (${methodPlaceholders})
        AND NOT EXISTS (
          SELECT 1 FROM royalty_transaction initialRoyalty
          WHERE initialRoyalty.paymentId = invoicePaymentRecord.id
            AND initialRoyalty.eventType = 'PAYMENT_RECEIVED'
        )
        AND DATE(invoicePaymentRecord.date) BETWEEN ? AND ?

      UNION ALL

      SELECT
        returnInvoice.location_id AS locationId,
        COALESCE(returnLine.royaltyCategoryId, returnItem.itemCategoryId, 0) AS categoryId,
        COALESCE(JSON_UNQUOTE(JSON_EXTRACT(returnLine.posSnapshot, '$.categoryName')), returnCategory.name, 'Uncategorized') AS categoryName,
        CASE WHEN ${includePOSValue}=1 AND returnLine.isPos=1 THEN 'POS Return' ELSE 'Invoice Return' END AS type,
        originalPayment.advertisementCalculationVersion,
        CASE WHEN COALESCE(returnLine.royaltyFree, 0) = 1
          THEN 0 ELSE COALESCE(returnLine.royaltyRateApplied, 0) END AS rate,
        CASE WHEN COALESCE(returnLine.royaltyFree, 0) = 1 THEN 0 ELSE COALESCE(returnLine.advertisementRateApplied, 0) END AS advertisementRate,
        COALESCE(returnLine.royaltyFree, 0) AS royaltyFree,
        ${returnRevenue} AS revenue,
        CASE WHEN COALESCE(returnLine.royaltyFree, 0) = 1
          THEN 0
          ELSE (${returnRevenue}) * COALESCE(returnLine.royaltyRateApplied, 0) / 100
        END AS royalty,
        CASE WHEN COALESCE(returnLine.royaltyFree, 0) = 1 THEN 0 ELSE (${returnRevenue}) * COALESCE(returnLine.advertisementRateApplied, 0) / 100 END AS advertisement
      FROM invoice_line_item returnLine
      INNER JOIN invoice returnInvoice ON returnInvoice.id = returnLine.invoice_id
      INNER JOIN invoice_reverse returnLink ON returnLink.reversedInvoiceId = returnInvoice.id
      INNER JOIN invoice originalInvoice ON originalInvoice.id = returnLink.invoiceId
      INNER JOIN invoice_payment originalInvoicePayment
        ON originalInvoicePayment.invoice_id = originalInvoice.id AND originalInvoicePayment.isDeleted = 0
      INNER JOIN payment originalPayment
        ON originalPayment.id = originalInvoicePayment.payment_id AND originalPayment.isDeleted = 0
      INNER JOIN item returnItem ON returnItem.id = returnLine.item_id
      LEFT JOIN item_category returnCategory
        ON returnCategory.id = COALESCE(returnLine.royaltyCategoryId, returnItem.itemCategoryId)
      WHERE returnInvoice.location_id IN (${locationPlaceholders})
        AND returnInvoice.type = 2
        AND returnInvoice.isDeleted = 0
        AND returnLine.isDeleted = 0
        AND originalPayment.payment_method_id NOT IN (${methodPlaceholders})
        -- POS-aware allocations already recognize only goods remaining at payment.
        -- Their return ledger handles paid returns; a pre-payment return must not
        -- be reconstructed again from dates (both events can share midnight).
        AND originalInvoicePayment.posPurposeSnapshot IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM royalty_transaction returnRoyalty
          WHERE returnRoyalty.paymentId = originalPayment.id
            AND returnRoyalty.sourceType = 'INVOICE_RETURN'
            AND returnRoyalty.sourceId = returnInvoice.id
            AND returnRoyalty.eventType = 'TRANSFER_OUT'
        )
        AND originalPayment.date <= returnInvoice.date
        AND DATE(returnInvoice.date) BETWEEN ? AND ?

      UNION ALL

      SELECT
        course.locationId AS locationId,
        COALESCE(lessonPayment.royaltyCategoryId, 1) AS categoryId,
        COALESCE(lessonCategory.name, 'Lessons') AS categoryName,
        'Lesson' AS type,
        lessonPaymentRecord.advertisementCalculationVersion,
        COALESCE(lessonPayment.royaltyRateApplied, locationRoyalty.value, 0) AS rate,
        COALESCE(lessonPayment.advertisementRateApplied, 0) AS advertisementRate,
        0 AS royaltyFree,
        ${lessonRevenue} AS revenue,
        (${lessonRevenue})
          * COALESCE(lessonPayment.royaltyRateApplied, locationRoyalty.value, 0) / 100 AS royalty,
        (${lessonRevenue}) * COALESCE(lessonPayment.advertisementRateApplied, 0) / 100 AS advertisement
      FROM lesson_payment lessonPayment
      INNER JOIN payment lessonPaymentRecord
        ON lessonPaymentRecord.id = lessonPayment.paymentId AND lessonPaymentRecord.isDeleted = 0
      INNER JOIN lesson ON lesson.id = lessonPayment.lessonId
      INNER JOIN course ON course.id = lesson.courseId
      LEFT JOIN private_lesson privateLesson ON privateLesson.lessonId = lesson.id
      LEFT JOIN group_lesson groupLesson
        ON groupLesson.lessonId = lesson.id
        AND groupLesson.enrolmentId = lessonPayment.enrolmentId
        AND groupLesson.isDeleted = 0
      LEFT JOIN location_debt locationRoyalty
        ON locationRoyalty.locationId = course.locationId AND locationRoyalty.type = 1
      LEFT JOIN item_category lessonCategory
        ON lessonCategory.id = COALESCE(lessonPayment.royaltyCategoryId, 1)
      WHERE course.locationId IN (${locationPlaceholders})
        AND lessonPayment.isDeleted = 0
        AND lessonPaymentRecord.payment_method_id NOT IN (${methodPlaceholders})
        AND NOT EXISTS (
          SELECT 1 FROM royalty_transaction initialRoyalty
          WHERE initialRoyalty.paymentId = lessonPaymentRecord.id
            AND initialRoyalty.eventType = 'PAYMENT_RECEIVED'
        )
        AND DATE(lessonPaymentRecord.date) BETWEEN ? AND ?

      UNION ALL

      SELECT
        pos.locationId AS locationId,
        COALESCE(posLine.royaltyCategoryId, posItem.itemCategoryId, 0) AS categoryId,
        COALESCE(posLine.royaltyCategoryNameSnapshot, posCategory.name, 'Uncategorized') AS categoryName,
        CASE WHEN posEvent.direction < 0 THEN 'POS Refund' ELSE 'POS' END AS type,
        posPayment.advertisementCalculationVersion,
        CASE WHEN COALESCE(posLine.royaltyFreeSnapshot, posItem.royaltyFree, 0) = 1
          THEN 0 ELSE COALESCE(posLine.royaltyRateApplied, 0) END AS rate,
        CASE WHEN COALESCE(posLine.royaltyFreeSnapshot, posItem.royaltyFree, 0) = 1 THEN 0 ELSE COALESCE(posLine.advertisementRateApplied, 0) END AS advertisementRate,
        COALESCE(posLine.royaltyFreeSnapshot, posItem.royaltyFree, 0) AS royaltyFree,
        (${posRevenue}) * posEvent.direction AS revenue,
        CASE WHEN COALESCE(posLine.royaltyFreeSnapshot, posItem.royaltyFree, 0) = 1
          THEN 0
          ELSE (${posRevenue}) * COALESCE(posLine.royaltyRateApplied, 0)
            / 100 * posEvent.direction
        END AS royalty,
        CASE WHEN COALESCE(posLine.royaltyFreeSnapshot, posItem.royaltyFree, 0) = 1 THEN 0 ELSE (${posRevenue}) * COALESCE(posLine.advertisementRateApplied, 0) / 100 * posEvent.direction END AS advertisement
      FROM pos_transaction_line_item posLine
      INNER JOIN pos_transaction pos ON pos.id = posLine.posTransactionId
      INNER JOIN (${posEvents}) posEvent ON posEvent.posId = pos.id
      INNER JOIN payment posPayment
        ON posPayment.id = posEvent.eventPaymentId
       AND posPayment.isDeleted = 0
      INNER JOIN item posItem ON posItem.id = posLine.itemId
      LEFT JOIN item_category posCategory
        ON posCategory.id = COALESCE(posLine.royaltyCategoryId, posItem.itemCategoryId)
      WHERE pos.locationId IN (${locationPlaceholders})
        AND posPayment.payment_method_id NOT IN (${methodPlaceholders})
        AND NOT EXISTS (
          SELECT 1 FROM royalty_transaction initialRoyalty
          WHERE initialRoyalty.paymentId = posPayment.id
            AND initialRoyalty.sourceType = 'POS_TRANSACTION'
        )
        AND DATE(posPayment.date) BETWEEN ? AND ?
        AND ? = 1
    ) recognized
    GROUP BY
      recognized.locationId,
      recognized.categoryId,
      recognized.categoryName,
      recognized.type,
      recognized.rate,
      recognized.advertisementRate,
      recognized.royaltyFree
  `;

  const categoryParameters = [
    ...scopeParameters(),
    ...scopeParameters(),
    ...scopeParameters(),
    ...scopeParameters(),
    includePOSValue,
  ];

  const invoiceTax =
    'invoice.tax * ABS(invoicePayment.amount) / NULLIF(ABS(invoice.total), 0)';
  const returnTax =
    'returnInvoice.tax * ABS(originalInvoicePayment.amount) / NULLIF(ABS(originalInvoice.total), 0)';
  const lessonTax = `
    SIGN(lessonPayment.amount) * ABS(lessonPayment.amount)
    * ABS(COALESCE(lesson.tax, 0))
    / NULLIF(${lessonBillingTotal}, 0)
  `;

  const amountsSql = `
    SELECT
      recognized.locationId,
      COALESCE(SUM(recognized.tax), 0) AS tax,
      COALESCE(SUM(CASE WHEN recognized.isPOS = 1 THEN recognized.tax ELSE 0 END), 0) AS posTax,
      COALESCE(SUM(recognized.royaltyFree), 0) AS royaltyFree
    FROM (
      SELECT invoice.location_id AS locationId, ${invoiceTax} AS tax, 0 AS royaltyFree, 0 AS isPOS
      FROM invoice
      INNER JOIN invoice_payment invoicePayment
        ON invoicePayment.invoice_id = invoice.id AND invoicePayment.isDeleted = 0
      INNER JOIN payment invoicePaymentRecord
        ON invoicePaymentRecord.id = invoicePayment.payment_id AND invoicePaymentRecord.isDeleted = 0
      LEFT JOIN invoice_reverse reversedInvoice
        ON reversedInvoice.reversedInvoiceId = invoice.id

      WHERE invoice.location_id IN (${locationPlaceholders})
        AND invoice.type = 2
        AND invoice.isDeleted = 0
        AND reversedInvoice.id IS NULL
        AND (invoice.isCanceled = 0 OR EXISTS (SELECT 1 FROM invoice_reverse originalReturn WHERE originalReturn.invoiceId=invoice.id))
        AND invoicePaymentRecord.payment_method_id NOT IN (${methodPlaceholders})
        AND NOT EXISTS (
          SELECT 1 FROM royalty_transaction initialRoyalty
          WHERE initialRoyalty.paymentId = invoicePaymentRecord.id
            AND initialRoyalty.eventType = 'PAYMENT_RECEIVED'
        )
        AND DATE(invoicePaymentRecord.date) BETWEEN ? AND ?

      UNION ALL

      SELECT
        invoice.location_id AS locationId,
        0 AS tax,
        ${invoiceRevenue} AS royaltyFree,
        0 AS isPOS
      FROM invoice_line_item lineItem
      INNER JOIN invoice ON invoice.id = lineItem.invoice_id
      INNER JOIN invoice_payment invoicePayment
        ON invoicePayment.invoice_id = invoice.id AND invoicePayment.isDeleted = 0
      INNER JOIN payment invoicePaymentRecord
        ON invoicePaymentRecord.id = invoicePayment.payment_id AND invoicePaymentRecord.isDeleted = 0
      LEFT JOIN invoice_reverse reversedInvoice
        ON reversedInvoice.reversedInvoiceId = invoice.id

      WHERE invoice.location_id IN (${locationPlaceholders})
        AND invoice.type = 2
        AND invoice.isDeleted = 0
        AND lineItem.isDeleted = 0
        AND lineItem.royaltyFree = 1
        AND reversedInvoice.id IS NULL
        AND (invoice.isCanceled = 0 OR EXISTS (SELECT 1 FROM invoice_reverse originalReturn WHERE originalReturn.invoiceId=invoice.id))
        AND invoicePaymentRecord.payment_method_id NOT IN (${methodPlaceholders})
        AND NOT EXISTS (
          SELECT 1 FROM royalty_transaction initialRoyalty
          WHERE initialRoyalty.paymentId = invoicePaymentRecord.id
            AND initialRoyalty.eventType = 'PAYMENT_RECEIVED'
        )
        AND DATE(invoicePaymentRecord.date) BETWEEN ? AND ?

      UNION ALL

      SELECT returnInvoice.location_id AS locationId, ${returnTax} AS tax, 0 AS royaltyFree, 0 AS isPOS
      FROM invoice returnInvoice
      INNER JOIN invoice_reverse returnLink ON returnLink.reversedInvoiceId = returnInvoice.id
      INNER JOIN invoice originalInvoice ON originalInvoice.id = returnLink.invoiceId
      INNER JOIN invoice_payment originalInvoicePayment
        ON originalInvoicePayment.invoice_id = originalInvoice.id AND originalInvoicePayment.isDeleted = 0
      INNER JOIN payment originalPayment
        ON originalPayment.id = originalInvoicePayment.payment_id AND originalPayment.isDeleted = 0
      WHERE returnInvoice.location_id IN (${locationPlaceholders})
        AND returnInvoice.type = 2
        AND returnInvoice.isDeleted = 0
        AND originalPayment.payment_method_id NOT IN (${methodPlaceholders})
        -- POS-aware allocations already recognize only goods remaining at payment.
        -- Their return ledger handles paid returns; a pre-payment return must not
        -- be reconstructed again from dates (both events can share midnight).
        AND originalInvoicePayment.posPurposeSnapshot IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM royalty_transaction returnRoyalty
          WHERE returnRoyalty.paymentId = originalPayment.id
            AND returnRoyalty.sourceType = 'INVOICE_RETURN'
            AND returnRoyalty.sourceId = returnInvoice.id
            AND returnRoyalty.eventType = 'TRANSFER_OUT'
        )
        AND originalPayment.date <= returnInvoice.date
        AND DATE(returnInvoice.date) BETWEEN ? AND ?

      UNION ALL

      SELECT
        returnInvoice.location_id AS locationId,
        0 AS tax,
        ${returnRevenue} AS royaltyFree,
        0 AS isPOS
      FROM invoice_line_item returnLine
      INNER JOIN invoice returnInvoice ON returnInvoice.id = returnLine.invoice_id
      INNER JOIN invoice_reverse returnLink ON returnLink.reversedInvoiceId = returnInvoice.id
      INNER JOIN invoice originalInvoice ON originalInvoice.id = returnLink.invoiceId
      INNER JOIN invoice_payment originalInvoicePayment
        ON originalInvoicePayment.invoice_id = originalInvoice.id AND originalInvoicePayment.isDeleted = 0
      INNER JOIN payment originalPayment
        ON originalPayment.id = originalInvoicePayment.payment_id AND originalPayment.isDeleted = 0
      WHERE returnInvoice.location_id IN (${locationPlaceholders})
        AND returnInvoice.type = 2
        AND returnInvoice.isDeleted = 0
        AND returnLine.isDeleted = 0
        AND returnLine.royaltyFree = 1
        AND originalPayment.payment_method_id NOT IN (${methodPlaceholders})
        -- POS-aware allocations already recognize only goods remaining at payment.
        -- Their return ledger handles paid returns; a pre-payment return must not
        -- be reconstructed again from dates (both events can share midnight).
        AND originalInvoicePayment.posPurposeSnapshot IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM royalty_transaction returnRoyalty
          WHERE returnRoyalty.paymentId = originalPayment.id
            AND returnRoyalty.sourceType = 'INVOICE_RETURN'
            AND returnRoyalty.sourceId = returnInvoice.id
            AND returnRoyalty.eventType = 'TRANSFER_OUT'
        )
        AND originalPayment.date <= returnInvoice.date
        AND DATE(returnInvoice.date) BETWEEN ? AND ?

      UNION ALL

      SELECT course.locationId AS locationId, ${lessonTax} AS tax, 0 AS royaltyFree, 0 AS isPOS
      FROM lesson_payment lessonPayment
      INNER JOIN payment lessonPaymentRecord
        ON lessonPaymentRecord.id = lessonPayment.paymentId AND lessonPaymentRecord.isDeleted = 0
      INNER JOIN lesson ON lesson.id = lessonPayment.lessonId
      INNER JOIN course ON course.id = lesson.courseId
      LEFT JOIN private_lesson privateLesson ON privateLesson.lessonId = lesson.id
      LEFT JOIN group_lesson groupLesson
        ON groupLesson.lessonId = lesson.id
        AND groupLesson.enrolmentId = lessonPayment.enrolmentId
        AND groupLesson.isDeleted = 0
      WHERE course.locationId IN (${locationPlaceholders})
        AND lessonPayment.isDeleted = 0
        AND lessonPaymentRecord.payment_method_id NOT IN (${methodPlaceholders})
        AND NOT EXISTS (
          SELECT 1 FROM royalty_transaction initialRoyalty
          WHERE initialRoyalty.paymentId = lessonPaymentRecord.id
            AND initialRoyalty.eventType = 'PAYMENT_RECEIVED'
        )
        AND DATE(lessonPaymentRecord.date) BETWEEN ? AND ?

      UNION ALL

      SELECT
        pos.locationId AS locationId,
        pos.tax * posEvent.direction AS tax,
        0 AS royaltyFree,
        1 AS isPOS
      FROM pos_transaction pos
      INNER JOIN (${posEvents}) posEvent ON posEvent.posId = pos.id
      INNER JOIN payment posPayment
        ON posPayment.id = posEvent.eventPaymentId
       AND posPayment.isDeleted = 0
      WHERE pos.locationId IN (${locationPlaceholders})
        AND posPayment.payment_method_id NOT IN (${methodPlaceholders})
        AND NOT EXISTS (
          SELECT 1 FROM royalty_transaction initialRoyalty
          WHERE initialRoyalty.paymentId = posPayment.id
            AND initialRoyalty.sourceType = 'POS_TRANSACTION'
        )
        AND DATE(posPayment.date) BETWEEN ? AND ?
        AND ? = 1

      UNION ALL

      SELECT
        pos.locationId AS locationId,
        0 AS tax,
        (${posRevenue}) * posEvent.direction AS royaltyFree,
        1 AS isPOS
      FROM pos_transaction_line_item posLine
      INNER JOIN pos_transaction pos ON pos.id = posLine.posTransactionId
      INNER JOIN (${posEvents}) posEvent ON posEvent.posId = pos.id
      INNER JOIN payment posPayment
        ON posPayment.id = posEvent.eventPaymentId
       AND posPayment.isDeleted = 0
      INNER JOIN item posItem ON posItem.id = posLine.itemId
      WHERE pos.locationId IN (${locationPlaceholders})
        AND COALESCE(posLine.royaltyFreeSnapshot, posItem.royaltyFree, 0) = 1
        AND posPayment.payment_method_id NOT IN (${methodPlaceholders})
        AND NOT EXISTS (
          SELECT 1 FROM royalty_transaction initialRoyalty
          WHERE initialRoyalty.paymentId = posPayment.id
            AND initialRoyalty.sourceType = 'POS_TRANSACTION'
        )
        AND DATE(posPayment.date) BETWEEN ? AND ?
        AND ? = 1
    ) recognized
    GROUP BY recognized.locationId
  `;

  const amountsParameters = [
    ...scopeParameters(),
    ...scopeParameters(),
    ...scopeParameters(),
    ...scopeParameters(),
    ...scopeParameters(),
    ...scopeParameters(),
    includePOSValue,
    ...scopeParameters(),
    includePOSValue,
  ];

  // When POS reconstruction is enabled, omit generic ledger rows linked to a
  // POS sale or refund. The direct queries above use its checkout snapshots;
  // a true POS_TRANSACTION ledger row remains authoritative when present.
  const ledgerCategorySql = `
    SELECT
      royaltyTransaction.locationId AS locationId,
      royaltyTransaction.itemCategoryId AS categoryId,
      royaltyTransaction.categoryName AS categoryName,
      CASE
        WHEN royaltyTransaction.eventType = 'OPENING_CREDIT'
          OR royaltyTransaction.sourceType = 'MIGRATION' THEN 'Opening Credit'
        WHEN royaltyTransaction.sourceType = 'POS_TRANSACTION'
          AND royaltyTransaction.eventType = 'REFUND' THEN 'POS Refund'
        WHEN royaltyTransaction.sourceType = 'POS_TRANSACTION' THEN 'POS'
        WHEN ${includePOSValue}=1 AND royaltyTransaction.isPos=1 AND royaltyTransaction.eventType='REFUND' THEN 'POS Refund'
        WHEN ${includePOSValue}=1 AND royaltyTransaction.isPos=1 AND royaltyTransaction.sourceType='INVOICE_RETURN' THEN 'POS Return'
        WHEN ${includePOSValue}=1 AND royaltyTransaction.isPos=1 THEN 'POS'
        WHEN royaltyTransaction.sourceType = 'INVOICE_PAYMENT' THEN 'Invoice'
        WHEN royaltyTransaction.sourceType = 'INVOICE_RETURN' THEN 'Invoice Return'
        WHEN royaltyTransaction.sourceType = 'LESSON_PAYMENT' THEN 'Lesson'
        WHEN royaltyTransaction.sourceType = 'RECURRING_PAYMENT' THEN 'Recurring Payment'
        WHEN royaltyTransaction.sourceType = 'REFUND' THEN 'Refund'
        WHEN royaltyTransaction.sourceType = 'MANUAL_ADJUSTMENT' THEN 'Adjustment'
        WHEN royaltyTransaction.sourceType = 'PAYMENT' THEN 'Receive Payment'
        ELSE 'Other'
      END AS type,
      CASE WHEN royaltyTransaction.royaltyFree = 1
        THEN 0 ELSE royaltyTransaction.rateApplied END AS rate,
      CASE WHEN royaltyTransaction.royaltyFree = 1 THEN 0 ELSE royaltyTransaction.advertisementRateApplied END AS advertisementRate,
      royaltyTransaction.royaltyFree AS royaltyFree,
      COALESCE(SUM(royaltyTransaction.revenueAmount), 0) AS revenue,
      COALESCE(SUM(
        CASE WHEN royaltyTransaction.royaltyFree = 1
          THEN 0 ELSE royaltyTransaction.royaltyAmount END
      ), 0) AS royalty,
      COALESCE(SUM(CASE WHEN royaltyTransaction.royaltyFree = 1 OR royaltyTransaction.schemaVersion < 2 THEN 0 ELSE royaltyTransaction.advertisementAmount END), 0) AS advertisement,
      COALESCE(SUM(CASE WHEN royaltyTransaction.schemaVersion < 2 THEN royaltyTransaction.revenueAmount ELSE 0 END), 0) AS historicalAdvertisementRevenue,
      COALESCE(SUM(CASE WHEN royaltyTransaction.schemaVersion < 2 AND royaltyTransaction.royaltyFree = 1 THEN royaltyTransaction.revenueAmount ELSE 0 END), 0) AS historicalAdvertisementFreeRevenue
    FROM royalty_transaction royaltyTransaction
    WHERE royaltyTransaction.locationId IN (${locationPlaceholders})
      AND royaltyTransaction.eventType <> 'ALLOCATION'
      AND DATE(royaltyTransaction.effectiveDate) BETWEEN ? AND ?
      AND (? = 1 OR royaltyTransaction.sourceType <> 'POS_TRANSACTION')
      AND (
        ? = 0
        OR royaltyTransaction.sourceType = 'POS_TRANSACTION'
        OR NOT EXISTS (
          SELECT 1
          FROM pos_transaction linkedPos
          WHERE linkedPos.paymentId = royaltyTransaction.paymentId
            OR linkedPos.refundPaymentId = royaltyTransaction.paymentId
        )
      )
    GROUP BY
      royaltyTransaction.locationId,
      royaltyTransaction.itemCategoryId,
      royaltyTransaction.categoryName,
      type,
      royaltyTransaction.rateApplied,
      royaltyTransaction.advertisementRateApplied,
      royaltyTransaction.royaltyFree
  `;
  const ledgerAmountsSql = `
    SELECT
      royaltyTransaction.locationId AS locationId,
      COALESCE(SUM(royaltyTransaction.taxAmount), 0) AS tax,
      COALESCE(SUM(CASE WHEN royaltyTransaction.sourceType = 'POS_TRANSACTION'
        THEN royaltyTransaction.taxAmount ELSE 0 END), 0) AS posTax,
      COALESCE(SUM(
        CASE
          WHEN royaltyTransaction.royaltyFree = 1
            THEN royaltyTransaction.revenueAmount
          ELSE 0
        END
      ), 0) AS royaltyFree
    FROM royalty_transaction royaltyTransaction
    WHERE royaltyTransaction.locationId IN (${locationPlaceholders})
      AND royaltyTransaction.eventType <> 'ALLOCATION'
      AND DATE(royaltyTransaction.effectiveDate) BETWEEN ? AND ?
      AND (? = 1 OR royaltyTransaction.sourceType <> 'POS_TRANSACTION')
      AND (
        ? = 0
        OR royaltyTransaction.sourceType = 'POS_TRANSACTION'
        OR NOT EXISTS (
          SELECT 1
          FROM pos_transaction linkedPos
          WHERE linkedPos.paymentId = royaltyTransaction.paymentId
            OR linkedPos.refundPaymentId = royaltyTransaction.paymentId
        )
      )
    GROUP BY royaltyTransaction.locationId
  `;
  const ledgerParameters = [
    ...locationIds,
    startDate,
    endDate,
    includePOSValue,
    includePOSValue,
  ];

  const [categoryRows, amountRows, ledgerCategoryRows, ledgerAmountRows] =
    await Promise.all([
      manager.query(categorySql, categoryParameters),
      manager.query(amountsSql, amountsParameters),
      manager.query(ledgerCategorySql, ledgerParameters),
      manager.query(ledgerAmountsSql, ledgerParameters),
    ]);

  const mergedCategoryRows = mergeCategoryRows([
    ...categoryRows,
    ...ledgerCategoryRows,
  ]);
  const mergedAmountRows = mergeAmountRows([
    ...amountRows,
    ...ledgerAmountRows,
  ]);

  return {
    categoryRows: mergedCategoryRows,
    amounts: mergedAmountRows,
  };
}

function mergeCategoryRows(
  rows: PaymentBasedRoyaltyRawRow[],
): PaymentBasedRoyaltyRow[] {
  const grouped = new Map<string, PaymentBasedRoyaltyRow>();
  for (const row of rows) {
    const normalized: PaymentBasedRoyaltyRow = {
      locationId: Number(row.locationId),
      categoryId: Number(row.categoryId || 0),
      categoryName: row.categoryName || 'Uncategorized',
      type: row.type || 'Other',
      rate: Number(row.rate || 0),
      advertisementRate: Number(row.advertisementRate || 0),
      advertisement: Number(row.advertisement || 0),
      ...(row.historicalAdvertisementRevenue !== undefined ? {
        historicalAdvertisementRevenue: Number(row.historicalAdvertisementRevenue || 0),
        historicalAdvertisementFreeRevenue: Number(row.historicalAdvertisementFreeRevenue || 0),
      } : {}),
      royaltyFree: Boolean(Number(row.royaltyFree)),
      revenue: Number(row.revenue || 0),
      royalty: Number(row.royalty || 0),
    };
    const key = [
      normalized.locationId,
      normalized.categoryId,
      normalized.categoryName,
      normalized.type,
      normalized.rate,
      normalized.advertisementRate,
      normalized.royaltyFree ? 1 : 0,
    ].join(':');
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, normalized);
      continue;
    }
    existing.revenue = RoundingUtils.roundHalfUp(
      existing.revenue + normalized.revenue,
    );
    if (normalized.historicalAdvertisementRevenue !== undefined || existing.historicalAdvertisementRevenue !== undefined) {
      existing.historicalAdvertisementRevenue = RoundingUtils.roundHalfUp(
        (existing.historicalAdvertisementRevenue ?? 0) + (normalized.historicalAdvertisementRevenue ?? 0),
      );
      // Free revenue was subtracted once at location level in the old formula.
      // Keep its precision here instead of rounding each category separately.
      existing.historicalAdvertisementFreeRevenue = RoundingUtils.decimal(existing.historicalAdvertisementFreeRevenue ?? 0)
        .plus(normalized.historicalAdvertisementFreeRevenue ?? 0).toNumber();
    }
    existing.advertisement = RoundingUtils.roundHalfUp(
      (existing.advertisement ?? 0) + (normalized.advertisement ?? 0),
    );
    existing.royalty = RoundingUtils.roundHalfUp(
      existing.royalty + normalized.royalty,
    );
  }
  return Array.from(grouped.values());
}

function mergeAmountRows(
  rows: PaymentBasedRoyaltyAmountsRawRow[],
): PaymentBasedRoyaltyAmounts[] {
  const grouped = new Map<number, PaymentBasedRoyaltyAmounts>();
  for (const row of rows) {
    const locationId = Number(row.locationId);
    const existing = grouped.get(locationId);
    if (!existing) {
      grouped.set(locationId, {
        locationId,
        tax: Number(row.tax || 0),
        posTax: Number(row.posTax || 0),
        royaltyFree: Number(row.royaltyFree || 0),
      });
      continue;
    }
    existing.tax = RoundingUtils.roundHalfUp(
      existing.tax + Number(row.tax || 0),
    );
    existing.posTax = RoundingUtils.roundHalfUp(
      existing.posTax + Number(row.posTax || 0),
    );
    existing.royaltyFree = RoundingUtils.roundHalfUp(
      existing.royaltyFree + Number(row.royaltyFree || 0),
    );
  }
  return Array.from(grouped.values());
}
