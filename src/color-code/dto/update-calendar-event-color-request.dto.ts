import { IsArray, IsInt, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateCalendarEventColorItemDto {
  @IsInt()
  id: number;

  @IsString()
  @IsOptional()
  code: string;

}

export class UpdateCalendarEventColorRequestDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateCalendarEventColorItemDto)
  colors: UpdateCalendarEventColorItemDto[];
}
