import { IsIn, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';
import { LocationAvailability } from '../entities/location-availability.entity';

/** Query DTO for GET locations/:location/render-events */
export class LocationRenderEventsRequestDto {
  @Type(() => Number)
  @IsNumber()
  @IsIn(
    [LocationAvailability.TYPE_OPERATION_TIME,LocationAvailability.TYPE_SCHEDULE_TIME],
    {
      message: `type must be ${LocationAvailability.TYPE_OPERATION_TIME} (operation time) or ${LocationAvailability.TYPE_SCHEDULE_TIME} (schedule time)`,
    },
  )
  type: number;
}
