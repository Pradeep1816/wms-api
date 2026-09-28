import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { AuthService, type AuthenticatedUser } from '../../auth/services/auth.service';
import { LocationResolveGuard } from '../../shared/guards/location.guard';
import { LocationId } from '../../shared/decorators/location-id.decorator';
import { ResponseHelper } from '../../shared/helpers/response.helper';
import { LessonDetailService } from '../services/lesson-detail.service';
import { LessonDetailRepository } from '../repositories/lesson-detail.repository';

@Controller('user/v2/:location/schedule')
@UseGuards(AuthGuard, RolesGuard, LocationResolveGuard)
export class UserScheduleLessonController {
  constructor(
    private readonly lessonDetailService: LessonDetailService,
    private readonly lessonDetailRepository: LessonDetailRepository,
    private readonly authService: AuthService,
  ) {}

  @Get('details/:id')
  @Roles(RolesEnum.TEACHER, RolesEnum.CUSTOMER)
  async getLessonDetail(
    @LocationId() locationId: number,
    @Param('location') locationSlug: string,
    @Param('id', ParseIntPipe) lessonId: number,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    try {
      const portalUserId = await this.authService.resolvePortalUserId(
        currentUser.id,
        locationId,
      );

      if (!portalUserId) {
        throw new NotFoundException(
          `User with ID ${currentUser.id} not found in location ${locationSlug}`,
        );
      }

      await this.assertUserCanAccessLesson(
        locationId,
        lessonId,
        currentUser,
        portalUserId,
      );

      const lessonDetail = await this.lessonDetailService.getLessonDetails(
        locationId,
        locationSlug,
        lessonId,
      );
      const studentNote =
        await this.lessonDetailRepository.getStudentNoteByLessonId(lessonId);

      const userLessonDetail = {
        body: {
          lesson: {
            programName: lessonDetail.body.lesson.programName,
            classroomName: lessonDetail.body.lesson.classroomName,
            status: lessonDetail.body.lesson.status,
            isOnline: lessonDetail.body.lesson.isOnline,
          },
          otherDetails: {
            scheduledDate: lessonDetail.body.schedule.scheduledDate,
            time: lessonDetail.body.schedule.time,
            duration: lessonDetail.body.schedule.duration,
            student: lessonDetail.body.student?.studentName || null,
            note: studentNote,
          },
        },
      };

      return ResponseHelper.success(
        userLessonDetail,
        'Lesson detail retrieved successfully',
      );
    } catch (error) {
      if (error instanceof NotFoundException) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }

      if (
        error instanceof ForbiddenException ||
        error instanceof BadRequestException
      ) {
        return ResponseHelper.error(
          'BAD_REQUEST',
          error.message || 'Invalid request',
        );
      }

      const message =
        error instanceof Error
          ? error.message
          : 'Failed to retrieve lesson detail';

      return ResponseHelper.error('INTERNAL_SERVER_ERROR', message);
    }
  }

  private async assertUserCanAccessLesson(
    locationId: number,
    lessonId: number,
    currentUser: AuthenticatedUser,
    portalUserId: number,
  ): Promise<void> {
    if (currentUser.roles.includes(RolesEnum.TEACHER)) {
      const isTeacherLesson =
        await this.lessonDetailRepository.isLessonAssignedToTeacher(
          locationId,
          lessonId,
          portalUserId,
        );

      if (!isTeacherLesson) {
        throw new NotFoundException(`Lesson with id ${lessonId} not found`);
      }

      return;
    }

    if (currentUser.roles.includes(RolesEnum.CUSTOMER)) {
      const isCustomerLesson =
        await this.lessonDetailRepository.isLessonAssignedToCustomer(
          locationId,
          lessonId,
          portalUserId,
        );

      if (!isCustomerLesson) {
        throw new NotFoundException(`Lesson with id ${lessonId} not found`);
      }

      return;
    }

    throw new ForbiddenException('You are not allowed to access lesson detail');
  }
}
