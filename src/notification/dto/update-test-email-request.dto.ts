import { IsEmail, IsNotEmpty, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class UpdateTestEmailRequestDto {
  @IsNotEmpty({ message: 'Email cannot be blank.' })
  @IsEmail({}, { message: 'Email is not a valid email address.' })
  @MaxLength(255)
  @Transform(({ value }) => value?.trim())
  email: string;
}
