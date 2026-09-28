import { Controller, Get, Param, Query, UseGuards, ValidationPipe } from '@nestjs/common';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { ResponseHelper } from '../../shared/helpers/response.helper';
import { PrepaidLessonService } from '../../lesson/services/prepaid-lesson.service';
import { PrepaidLessonRequestDto } from '../../lesson/dto/prepaid-lesson-request.dto';

@Controller('admin/v2/:location/customers')
@UseGuards(AuthGuard, RolesGuard)
export class CustomerPrepaidLessonController {
  constructor(private readonly prepaidLessonService: PrepaidLessonService) {}

  @Get(':id/prepaid-lessons')
  @Roles(RolesEnum.BACKEND_USER)
  async getPrepaidLessonsByCustomerId(
    @Param('location') locationSlug: string,
    @Param('id') customerId: number,
    @Query(ValidationPipe) query: PrepaidLessonRequestDto,
  ): Promise<any> {
    try {
      const result = await this.prepaidLessonService.getPrepaidLessonsByCustomerId(
        locationSlug,
        customerId,
        query,
      );
      return ResponseHelper.success(result, 'Prepaid lessons retrieved successfully');
    } catch (error) {
      console.error('Error in getPrepaidLessonsByCustomerId controller:', error);
      if (error.message?.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to retrieve prepaid lessons');
    }
  }
}

