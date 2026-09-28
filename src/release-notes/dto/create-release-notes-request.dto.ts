
import { IsNotEmpty, IsString, IsOptional } from 'class-validator';

export class CreateReleaseNoteRequestDto {


  @IsString()
  @IsNotEmpty({ message: 'Schedule date is required' })
  scheduleDate: string;

  @IsNotEmpty({ message: 'version date is required' })
  @IsString()
  version:string

  @IsString()
  @IsNotEmpty({ message: 'Subject is required' })
  subject: string;

  @IsString()
  @IsNotEmpty({message:'summary is required '})
  summary: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
