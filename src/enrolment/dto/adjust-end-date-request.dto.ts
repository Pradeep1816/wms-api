import { IsString, IsNotEmpty, Matches } from 'class-validator';
import { Expose } from 'class-transformer';

export class AdjustEndDateRequestDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'endDate must be in YYYY-MM-DD format',
  })
  @Expose()
  endDate: string;
}

export class AdjustEndDatePreviewRequestDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'endDate must be in YYYY-MM-DD format',
  })
  @Expose()
  endDate: string;
}


