import { IsNotEmpty, IsString, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';

export class UpdateEmailTemplateRequestDto {
  @IsOptional()
  @IsNotEmpty({ message: 'Subject cannot be blank.' })
  @IsString()
  @Transform(({ value }) => value?.trim())
  subject?: string;

  @IsOptional()
  @IsNotEmpty({ message: 'Header cannot be blank.' })
  @IsString()
  header?: string;

  @IsOptional()
  @IsNotEmpty({ message: 'Footer cannot be blank.' })
  @IsString()
  footer?: string;
}
