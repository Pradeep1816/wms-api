import { IsNotEmpty, IsString, Matches } from 'class-validator';

/**
 * DTO for editing a lesson's due date.
 */
export class EditLessonDueDateDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^(\d{4}-\d{2}-\d{2}|[A-Za-z]{3}\s\d{1,2},\s\d{4})$/, {
    message: 'dueDate must be in YYYY-MM-DD or MMM D, YYYY format',
  })
  dueDate: string;
}
