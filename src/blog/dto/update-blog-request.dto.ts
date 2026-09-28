import { IsNotEmpty, IsString } from 'class-validator';

export class UpdateBlogRequestDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  content: string;
}
