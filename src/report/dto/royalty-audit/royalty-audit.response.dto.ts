export interface RoyaltyAuditActorDto {
  id: number;
  displayName: string;
  username: string | null;
}

export interface RoyaltyAuditRowDto {
  id: number;
  effectiveDate: string;
  eventType: string;
  locationId: number;
  customerId: number;
  customerName: string;
  paymentId: number | null;
  originalPaymentId: number | null;
  categoryId: number;
  categoryName: string;
  rateApplied: string;
  paymentAmount: string;
  revenueAmount: string;
  taxAmount: string;
  royaltyAmount: string;
  royaltyFree: boolean;
  sourceType: string;
  sourceId: number | null;
  relatedRoyaltyTransactionId: number | null;
  eventGroupId: string | null;
  reason: string | null;
  actor: RoyaltyAuditActorDto | null;
  createdOn: string | null;
}

export interface RoyaltyAuditTotalsDto {
  paymentAmount: string;
  revenueAmount: string;
  taxAmount: string;
  royaltyAmount: string;
}

export interface RoyaltyAuditResponseDto {
  body: RoyaltyAuditRowDto[];
  totals: RoyaltyAuditTotalsDto;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  meta: {
    locationId: number;
    locationName: string;
    locationSlug: string;
  };
}
