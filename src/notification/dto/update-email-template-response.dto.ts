import { Expose } from 'class-transformer';

export class UpdateEmailTemplateResponseDto {
  @Expose()
  id: number;

  @Expose()
  type: string;

  @Expose()
  subject: string;

  @Expose()
  header: string;

  @Expose()
  footer: string;

  @Expose()
  updatedAt: string;
}
