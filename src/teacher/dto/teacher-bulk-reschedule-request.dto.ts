import { Transform } from 'class-transformer';
import { IsDateString, IsNotEmpty } from 'class-validator';
import { formatDateYMD, parseDateFromIso } from 'src/utils/date-utils';

function normalizeDateValue(value: unknown): string {
  const normalizedValue = String(value ?? '')
    .replace(/\+/g, ' ')
    .replace(/,(\d{4})$/, ', $1')
    .trim();

  if (!normalizedValue) {
    return '';
  }

  const parsedDate = parseDateFromIso(normalizedValue);
  if (Number.isNaN(parsedDate.getTime())) {
    return normalizedValue;
  }

  return formatDateYMD(parsedDate);
}

export class TeacherBulkRescheduleRequestDto {
  @Transform(({ value }) => normalizeDateValue(value))
  @IsNotEmpty()
  @IsDateString()
  sourceDate!: string;

  @Transform(({ value }) => normalizeDateValue(value))
  @IsNotEmpty()
  @IsDateString()
  destinationDate!: string;
}
