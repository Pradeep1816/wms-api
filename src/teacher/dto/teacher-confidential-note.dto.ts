import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateTeacherConfidentialNoteDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(20000)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  content: string;
}
