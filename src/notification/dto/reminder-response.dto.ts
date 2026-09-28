import { Expose, Type } from 'class-transformer';

export class ReminderNoteResponseDto {
  @Expose()
  id: number;

  @Expose()
  notes: string;
}

export class ReminderNoteListResponseDto {
  @Expose()
  @Type(() => ReminderNoteResponseDto)
  body: ReminderNoteResponseDto[];

  @Expose()
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export class ReminderNoteApiResponseDto {
  @Expose()
  success: boolean = true;

  @Expose()
  message: string = 'Reminder Note retrieved successfully';

  @Expose()
  @Type(() => ReminderNoteListResponseDto)
  data: ReminderNoteListResponseDto;
}
