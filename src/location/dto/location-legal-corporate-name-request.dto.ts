import { IsString, MaxLength } from 'class-validator';

export class LocationLegalCorporateNameRequestDto {
  @IsString()
  @MaxLength(255, {
    message: 'Legal Corporate Name must be at most 255 characters',
  })
  legalCorporateName: string;
}
