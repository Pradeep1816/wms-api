import { IsArray, IsString, IsOptional, IsEmail } from 'class-validator';

export class SendEmailStatementRequestDto {
  @IsArray()
  @IsEmail({}, { each: true })
  to: string[];

  @IsString()
  subject: string;

  @IsString()
  content: string;

  @IsOptional()
  @IsString()
  bcc?: string;
}

