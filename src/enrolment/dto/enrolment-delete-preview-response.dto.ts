export class DeletePreviewItemDto {
  objects: string;
  action: string;
  date_range: string;
}

export class DeletePreviewPaymentDto {
  amount: number;
  type: string; // Payment method name
  reference: string | null;
}

export class EnrolmentDeletePreviewResponseDto {
  previewItems: DeletePreviewItemDto[];
  payments: DeletePreviewPaymentDto[];
  dateRange: string; // Formatted date range string
}
