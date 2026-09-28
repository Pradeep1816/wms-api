import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { LocationResolveGuard } from '../../shared/guards/location.guard';
import { ResponseHelper } from '../../shared/helpers/response.helper';
import { ValidateEditScheduleService } from '../services/validate-edit-schedule.service';
import { ValidateEditScheduleRequestDto } from '../dto/validate-edit-schedule-request.dto';
import { LocationId } from 'src/shared/decorators/location-id.decorator';

@Controller('admin/v2/:location/lesson')
@UseGuards(AuthGuard, RolesGuard, LocationResolveGuard)
export class ValidateEditScheduleController {
  constructor(
    private readonly validateEditScheduleService: ValidateEditScheduleService,
  ) {}

  /**
   * Validate lesson edit schedule before submit (no side effects).
   * Query: date?, teacherId?, duration?.
   * - If date is empty: only format/required checks.
   * - If date is present: full business validation (invoiced, eligible, overlap, student).
   * Returns { errors: { date?, teacherId?, duration? } } (v2 plain keys).
   */
  @Get(':id/validate-edit-schedule')
  @Roles(RolesEnum.BACKEND_USER)
  async validateEditSchedule(
    @LocationId() locationId: number,
    @Param('location') locationSlug: string,
    @Param('id') id: number,
    @Query() query: ValidateEditScheduleRequestDto,
  ): Promise<any> {
    try {
  
      const result =
        await this.validateEditScheduleService.validateLessonOnUpdate(
          id,
          locationId,
          query,
        );
      return ResponseHelper.success(result, 'Validation completed');
    } catch (error) {
      console.error('Error in validateEditSchedule controller:', error);
      return ResponseHelper.errors.INTERNAL_ERROR(
        error instanceof Error ? error.message : 'Validation failed',
      );
    }
  }
}
