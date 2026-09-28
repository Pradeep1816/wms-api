import { Body, Controller, Put, UseGuards, ValidationPipe } from "@nestjs/common";
import { Roles } from "src/auth/decorators/roles.decorator";
import { RolesEnum } from "src/auth/enums/roles.enum";
import { AuthGuard } from "src/auth/guards/auth.guard";
import { RolesGuard } from "src/auth/guards/roles.guard";
import { LocationId } from "src/shared/decorators/location-id.decorator";
import { LocationResolveGuard } from "src/shared/guards/location.guard";
import { EditClassroomRequestDto } from "../dto/private-lesson-action-dto/edit-classroom-request.dto";
import { ResponseHelper } from "src/shared/helpers/response.helper";
import { EditClassroomService } from "../services/private-lesson-actions/edit-classroom.service";

@Controller('admin/v2/:location/private-lesson')
@UseGuards(AuthGuard,RolesGuard,LocationResolveGuard)
export class PrivateLessonEditClassroomController {
    constructor(
        private readonly editClassroomService: EditClassroomService,
    ) {}

    
  /**
   * Bulk edit classroom for selected private lessons.
   * Matches legacy EditClassroom behavior from private lesson listing.
   */
  @Put('edit-classroom')
  @Roles(RolesEnum.BACKEND_USER)
  async editClassroom(
    @LocationId() locationId: number,
    @Body(ValidationPipe) body: EditClassroomRequestDto,
  ): Promise<any> {
    try {
      const { lessonIds, classroomId } = body;
      // Omitted or null → clear classroom for selected lessons
      const classroomIdOrNull = classroomId ?? null;

      const result = await this.editClassroomService.editClassroomForLessons(
        locationId,
        lessonIds,
        classroomIdOrNull,
      );

      return ResponseHelper.success(
        { updatedLessonIds: result.updatedLessonIds },
        'Lesson classroom edited successfully',
      );
    } catch (error) {
      console.error('Error in editClassroom controller:', error);
      if (error.status === 403) {
        return ResponseHelper.error('FORBIDDEN', error.message);
      }
      return ResponseHelper.error(
        'BAD_REQUEST',
        error.message || 'Failed to update classroom for lessons',
      );
    }
  }
}   
