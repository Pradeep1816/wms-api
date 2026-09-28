import { IsString, IsNumberString, IsNotEmpty, IsOptional, IsNumber, Min, IsEnum } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { NoteInstanceType } from '../enums/comment.enum';


// This is outdated and will be removed
export class CommentsRequestDto {
  @IsString()
  location: string;

  @IsNumberString()
  id: string;
}

export class CommentRequestDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number = 20;

  @IsNotEmpty()
  @Transform(({ value }) => {
    const str = String(value).trim().toUpperCase();
    // Only accept string enum keys (e.g., "USER" -> 2), reject numeric values
    if (str in NoteInstanceType) {
      return NoteInstanceType[str as keyof typeof NoteInstanceType];
    }
    return value;
  })
  @IsEnum(NoteInstanceType, {
    message: `type must be one of: ${Object.keys(NoteInstanceType).filter(key => isNaN(Number(key))).map(key => key.toLowerCase()).join(', ')}`
  })
  type: NoteInstanceType;

  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  id: number;
}

export class CreateCommentRequestDto {
  @IsNotEmpty()
  @IsString()
  @Transform(({ value }) => value?.trim())
  content: string;
}
