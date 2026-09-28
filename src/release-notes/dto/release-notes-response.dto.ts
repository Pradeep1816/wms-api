import { Expose, Type } from 'class-transformer';

export class ReleaseNotesResponseDto {
  @Expose()
  id: number;

  @Expose()
  subject: string;

  @Expose()
  summary: string;

  @Expose()
  notes: string;

  @Expose()
  scheduleDate: string;

  @Expose()
  date: string;

  @Expose()
  userId: number;

  @Expose()
  userPublicIdentity: string;   

  @Expose()
  isRead: boolean;

  @Expose()
  isDeleted: boolean;
}

export class ReleaseNotesPaginationDto {
  @Expose()
  page: number;

  @Expose()
  limit: number;

  @Expose()
  total: number;

  @Expose()
  totalPages: number;
}

export class ReleaseNotesListResponseDto {
  @Expose()
  @Type(() => ReleaseNotesResponseDto)
  body: ReleaseNotesResponseDto[];

  @Expose()
  @Type(() => ReleaseNotesPaginationDto)
  pagination: ReleaseNotesPaginationDto;
}
