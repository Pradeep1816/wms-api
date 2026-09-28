import { IsNumber } from 'class-validator';

export class UpdateReadNotesRequestDto {
  @IsNumber()
  id: number;
}

