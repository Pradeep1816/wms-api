import {
  BadRequestException,
  Body,
  Controller,
  NotFoundException,
  Put,
  Req,
  UnauthorizedException,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { RolesEnum } from 'src/auth/enums/roles.enum';
import { AuthGuard } from 'src/auth/guards/auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { LocationId } from 'src/shared/decorators/location-id.decorator';
import { LocationResolveGuard } from 'src/shared/guards/location.guard';
import { ResponseHelper } from 'src/shared/helpers/response.helper';
import { EditOnlineTypeDto } from '../dto/private-lesson-action-dto/edit-online-type.dto';
import { PrivateLessonEditOnlineTypeService } from '../services/private-lesson-actions/private-lesson-edit-online-type.service';

@Controller('admin/v2/:location/private-lesson')
@UseGuards(AuthGuard, RolesGuard, LocationResolveGuard)
export class PrivateLessonEditOnlineTypeController {
  constructor(
    private readonly privateLessonEditOnlineTypeService: PrivateLessonEditOnlineTypeService,
  ) {}

  /**
   * Edit online type for selected private lessons.
   * PUT /admin/v2/:location/private-lesson/edit-online-type
   */
  @Put('edit-online-type')
  @Roles(RolesEnum.BACKEND_USER)
  async editOnlineType(
    @Req() req: any,
    @LocationId() locationId: number,
    @Body(ValidationPipe) body: EditOnlineTypeDto,
  ): Promise<any> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        throw new UnauthorizedException('User not authenticated');
      }

      const result = await this.privateLessonEditOnlineTypeService.editOnlineType(
        locationId,
        body,
        userId,
      );

      return ResponseHelper.success({lessonIds: body.lessonIds}, result.message);
    } catch (error) {
      console.error('Error in editOnlineType controller:', error);
      return ResponseHelper.errors.INTERNAL_ERROR(error.message);
    }
  }
}
