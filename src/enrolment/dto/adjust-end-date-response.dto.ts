import { Expose } from 'class-transformer';

export class PreviewItemDto {
  @Expose()
  objects: string;

  @Expose()
  action: string;

  @Expose()
  date_range: string;
}

export class AdjustEndDatePreviewDataDto {
  @Expose()
  action: 'shrink' | 'extend' | null;

  @Expose()
  dateRange: string | null;

  @Expose()
  previewItems: PreviewItemDto[];
}

export class AdjustEndDatePreviewResponseDto {
  @Expose()
  success: boolean = true;

  @Expose()
  message: string = 'Preview generated successfully';

  @Expose()
  data: AdjustEndDatePreviewDataDto;
}

export class AdjustEndDateResponseDto {
  @Expose()
  success: boolean = true;

  @Expose()
  message: string = 'End date adjusted successfully';

  @Expose()
  data?: any;
}


