import { Transform } from 'class-transformer';
import { IsString, MaxLength } from 'class-validator';

export class UpdateTeacherDocumentDisclosureDto {
  @IsString()
  @MaxLength(100000)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  content: string;
}
