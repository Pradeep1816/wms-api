import { ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import { InvoiceReverse } from '../../invoice/entities/invoice-reverse.entity';

/**
 * Include active invoices and the canceled original side of an invoice return.
 *
 * A return creates a negative credit invoice and marks the original invoice as
 * canceled. The original is linked through invoice_reverse.invoiceId, while the
 * credit invoice remains active. Including both makes returns net correctly:
 *
 * - original returned invoice: canceled + reverse link -> included
 * - negative credit invoice: active + no original-side link -> included
 * - ordinary canceled invoice: canceled + no reverse link -> excluded
 */
export function applyReturnAwareInvoiceReportingFilter<T extends ObjectLiteral>(
  queryBuilder: SelectQueryBuilder<T>,
  invoiceAlias = 'invoice',
  invoiceReverseAlias = 'invoiceReverse',
): SelectQueryBuilder<T> {
  return queryBuilder
    .leftJoin(
      InvoiceReverse,
      invoiceReverseAlias,
      `${invoiceReverseAlias}.invoiceId = ${invoiceAlias}.id`,
    )
    .andWhere(
      `(${invoiceAlias}.isCanceled = false OR ${invoiceReverseAlias}.id IS NOT NULL)`,
    );
}
