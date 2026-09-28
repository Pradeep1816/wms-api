export class DiscountPreviewItemDto {
  objects: string;
  action: string;
  date_range: string;
  class?: string;
}

export class EnrolmentDiscountPreviewResponseDto {
  previewItems: DiscountPreviewItemDto[];
}
