import { SelectQueryBuilder } from 'typeorm';
import { Invoice } from '../../invoice/entities/invoice.entity';
import { InvoiceReverse } from '../../invoice/entities/invoice-reverse.entity';
import { applyReturnAwareInvoiceReportingFilter } from './return-aware-invoice-reporting.util';

describe('applyReturnAwareInvoiceReportingFilter', () => {
  it('includes active invoices and returned originals while excluding ordinary cancellations', () => {
    const leftJoin = vi.fn().mockReturnThis();
    const andWhere = vi.fn().mockReturnThis();
    const queryBuilder = {
      leftJoin,
      andWhere,
    } as unknown as SelectQueryBuilder<Invoice>;

    const result = applyReturnAwareInvoiceReportingFilter(queryBuilder);

    expect(result).toBe(queryBuilder);
    expect(leftJoin).toHaveBeenCalledWith(
      InvoiceReverse,
      'invoiceReverse',
      'invoiceReverse.invoiceId = invoice.id',
    );
    expect(andWhere).toHaveBeenCalledWith(
      '(invoice.isCanceled = false OR invoiceReverse.id IS NOT NULL)',
    );
  });

  it('supports the aliases used by batched all-locations queries', () => {
    const leftJoin = vi.fn().mockReturnThis();
    const andWhere = vi.fn().mockReturnThis();
    const queryBuilder = {
      leftJoin,
      andWhere,
    } as unknown as SelectQueryBuilder<Invoice>;

    applyReturnAwareInvoiceReportingFilter(queryBuilder, 'i', 'returnLink');

    expect(leftJoin).toHaveBeenCalledWith(
      InvoiceReverse,
      'returnLink',
      'returnLink.invoiceId = i.id',
    );
    expect(andWhere).toHaveBeenCalledWith(
      '(i.isCanceled = false OR returnLink.id IS NOT NULL)',
    );
  });
});
