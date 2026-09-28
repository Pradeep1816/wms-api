import { IsBoolean, IsNumber } from 'class-validator';

export class PopupOkRequestDto {
  @IsNumber()
  userId: number;

  @IsBoolean()
  isRead: boolean;
}

