import { IsNotEmpty, IsString } from 'class-validator';

export class CreateBlogRequestDto {
  @IsNotEmpty({ message: 'Title is required' })
  @IsString()
  title: string;

  @IsNotEmpty({ message: 'Content is required' })
  @IsString()
  content: string;
}
