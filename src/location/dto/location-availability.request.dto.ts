import { IsInt, IsString, Min, Max, Matches } from 'class-validator';

export class LocationAvailabilityEditDto {
  @IsInt()
  @Min(1)
  @Max(7)
  resourceId: number; // day 1-7 (1=Mon, 7=Sun)

  @IsInt()
  @Min(1)
  @Max(2)
  type: number; // 1=Operational, 2=Schedule

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/, {
    message: 'startTime must be YYYY-MM-DD HH:mm:ss',
  })
  startTime: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/, {
    message: 'endTime must be YYYY-MM-DD HH:mm:ss',
  })
  endTime: string;
}
