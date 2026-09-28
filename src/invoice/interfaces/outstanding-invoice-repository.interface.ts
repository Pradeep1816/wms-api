export interface IOutstandingInvoiceQueryRepository {
  getOutstandingInvoicesByCustomerId(
    customerId: number,
    locationId: number,
    page: number,
    limit: number,
  ): Promise<{ invoices: any[]; total: number; totalBalanceDue: number; paymentMap: Record<number, string> }>;
}
