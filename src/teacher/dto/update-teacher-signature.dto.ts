import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateTeacherSignatureDto {
  @IsOptional()
  @IsString()
  @MaxLength(500000)
  signatureDataUrl?: string | null;
}
