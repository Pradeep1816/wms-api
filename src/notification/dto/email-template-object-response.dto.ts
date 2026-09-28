import { Expose } from 'class-transformer';

export class EmailTemplateObjectResponseDto {
  @Expose()
  subject: string;

  @Expose()
  header: string;

  @Expose()
  footer: string;
}
