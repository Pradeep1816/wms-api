import { Controller, Get, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { LessonEmailStatementService } from '../services/lesson-email-statement.service';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { LocationResolveGuard } from '../../shared/guards/location.guard';
import { ResponseHelper } from '../../shared/helpers/response.helper';
import { LocationId } from '../../shared/decorators/location-id.decorator';
import { LessonEmailStatementResponseDto } from '../dto/lesson-email-statement-response.dto';

@Controller('admin/v2/:location/lesson')
@UseGuards(AuthGuard, RolesGuard, LocationResolveGuard)
export class LessonEmailStatementController {
  constructor(
    private readonly lessonEmailStatementService: LessonEmailStatementService,
  ) {}

  @Get(':id/email-statement')
  @Roles(RolesEnum.BACKEND_USER)
  async getLessonEmailStatement(
    @LocationId() locationId: number,
    @Param('id', ParseIntPipe) lessonId: number,
  ): Promise<LessonEmailStatementResponseDto | any> {
    try {
      const result = await this.lessonEmailStatementService.getLessonEmailStatement(
        locationId,
        lessonId,
      );

      return ResponseHelper.success(result, 'Lesson email statement retrieved successfully');
    } catch (error) {
      console.error('Error in getLessonEmailStatement controller:', error);

      if (error.message.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }

      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to retrieve lesson email statement');
    }
  }
}
