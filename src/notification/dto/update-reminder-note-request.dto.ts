import { IsOptional, IsString } from "class-validator";

export class UpdateReminderNoteRequestDto {
  @IsString()
  @IsOptional()
  notes: string;
}
