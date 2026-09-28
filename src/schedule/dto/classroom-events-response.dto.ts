import { IsNumber, IsString, IsOptional, IsBoolean } from 'class-validator';

export class ClassroomEventDto {
  @IsNumber()
  id: number;

  @IsNumber()
  resourceId: number;

  @IsString()
  title: string;

  @IsString()
  start: string;

  @IsString()
  end: string;

  @IsOptional()
  @IsString()
  url?: string;

  @IsOptional()
  @IsString()
  className?: string;

  @IsOptional()
  @IsString()
  backgroundColor?: string;

  @IsOptional()
  tooltip?: Array<{name: string, value: string}>;
}

export class ClassroomAvailabilityDto {
  @IsNumber()
  resourceId: number;

  @IsString()
  title: string;

  @IsString()
  start: string;

  @IsString()
  end: string;

  @IsOptional()
  @IsString()
  className?: string;

  @IsOptional()
  @IsString()
  backgroundColor?: string;

  @IsString()
  rendering: string;
}

export class ClassroomEventsResponseDto {
  events: ClassroomEventDto[];
  availability: ClassroomAvailabilityDto[];
  totalEvents: number;
  date: string;
  locationId: number;
}
