import { IsArray, IsOptional, IsString } from 'class-validator';

export class InvoicePaymentEmailSendRequestDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  to?: string[];

  @IsOptional()
  @IsString()
  subject?: string;

  @IsOptional()
  @IsString()
  content?: string;
}
