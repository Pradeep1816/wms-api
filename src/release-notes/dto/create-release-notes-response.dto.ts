import { Expose } from 'class-transformer';

export class CreateReleaseNoteResponseDto {

  @Expose()
  id: number;

  @Expose()
  subject: string;

  @Expose()
  scheduleDate: string;

  @Expose()
  createdByUserId: number;
}