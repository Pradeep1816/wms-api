export class SalesSummaryDto {
  itemCategoryId: number;
  lineCount: string;
  subtotal: string;
  tax: string;
  total: string;
}

export class SalesResponseDto {
  body: SalesSummaryDto[];
  footer: { subtotal: string; tax: string; total: string }[];
  meta: { startDate: string; endDate: string; location: string };
}

export class SalesPaymentSummaryDto {
	paymentMethodId: number;
	paymentMethodName?: string;
	subtotal: string;
}

export class SalesPaymentsResponseDto {
	body: SalesPaymentSummaryDto[];
	footer: { subtotal: string }[];
	meta: { startDate: string; endDate: string; location: string };
}
