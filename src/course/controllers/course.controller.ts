import { BadRequestException, Controller, Get, Post, Delete, Query, Body, UseGuards, Param, Request, ParseIntPipe } from '@nestjs/common';
import { CourseService } from '../services/course.service';
import { GroupCourseCreateService } from '../services/group-course-create.service';
import { CourseLessonReviewService } from '../services/course-lesson-review.service';
import { CourseLessonConfirmService } from '../services/course-lesson-confirm.service';
import { CourseReviewLessonDeleteService } from '../services/course-review-lesson-delete.service';
import { CourseLessonApplyAllService } from '../services/course-lesson-apply-all.service';
import { UpdateLessonFieldRequestDto } from '../../lesson/dto/update-lesson-field-request.dto';
import { CourseLessonConfirmRequestDto } from '../dto/course-lesson-confirm-request.dto';
import { FetchGroupCoursesRequestDto } from '../dto/fetch-group-courses-request.dto';
import { CreateGroupCourseRequestDto } from '../dto/create-group-course-request.dto';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { LocationResolveGuard } from '../../shared/guards/location.guard';
import { LocationId } from '../../shared/decorators/location-id.decorator';
import { ResponseHelper } from '../../shared/helpers/response.helper';

@Controller('admin/v2/:location/course')
@UseGuards(AuthGuard, RolesGuard, LocationResolveGuard)
export class CourseController {
  constructor(
    private readonly courseService: CourseService,
    private readonly groupCourseCreateService: GroupCourseCreateService,
    private readonly courseLessonReviewService: CourseLessonReviewService,
    private readonly courseLessonConfirmService: CourseLessonConfirmService,
    private readonly courseReviewLessonDeleteService: CourseReviewLessonDeleteService,
    private readonly courseLessonApplyAllService: CourseLessonApplyAllService,
  ) {}

  /**
   * Fetch available group courses for a student
   * GET /admin/v2/:location/course/fetch-group?studentId=123&courseName=optional
   */
  @Get('fetch-group')
  @Roles(RolesEnum.BACKEND_USER)
  async fetchGroupCourses(
    @Param('location') locationSlug: string,
    @LocationId() locationId: number,
    @Query() query: FetchGroupCoursesRequestDto,
  ): Promise<any> {
    try {
      const courses = await this.courseService.fetchGroupCourses(
        locationId,
        query.studentId,
        query.courseName,
      );

      return ResponseHelper.success(courses, 'Group courses retrieved successfully');
    } catch (error) {
      console.error('Error in fetchGroupCourses controller:', error);
      if (error.message?.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      return ResponseHelper.error(
        'INTERNAL_SERVER_ERROR',
        'Failed to retrieve group courses',
      );
    }
  }

  /**
   * Creates a group course with:
   * - Course record
   * - Course program rate
   * - Course group metadata
   * - Course schedules
   * - All lesson records for the duration
   */
  @Post('create')
  @Roles(RolesEnum.BACKEND_USER)
  async createGroupCourse(
    @Param('location') locationSlug: string,
    @LocationId() locationId: number,
    @Body() body: CreateGroupCourseRequestDto,
    @Request() req: any,
  ): Promise<any> {
    try {
      const loggedUserId = req.user?.id || req.user?.userId;

      if (!loggedUserId) {
        return ResponseHelper.error('UNAUTHORIZED', 'User not authenticated');
      }

      const result = await this.groupCourseCreateService.createGroupCourse(
        locationId,
        locationSlug,
        body,
        loggedUserId,
      );

      return result;
    } catch (error) {
      console.error('Error in createGroupCourse controller:', error);

      if (error.message?.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }

      if (error.message?.includes('not qualified') || error.message?.includes('must be')) {
        return ResponseHelper.error('VALIDATION_ERROR', error.message);
      }

      return ResponseHelper.error(
        'INTERNAL_SERVER_ERROR',
        error.message || 'Failed to create group course',
      );
    }
  }

  /**
   * Returns all unconfirmed lessons with conflict detection:
   * - Holiday conflicts
   * - Teacher conflicts
   * - Student conflicts (for private programs only)
   */
  @Get('review-lesson')
  @Roles(RolesEnum.BACKEND_USER)
  async getGroupCourseReview(
    @LocationId() locationId: number,
    @Query('courseId') courseId: string,
    @Query('showAll') showAll?: string,
  ): Promise<any> {
    try {
      const courseIdNumber = parseInt(courseId, 10);
      if (isNaN(courseIdNumber)) {
        return ResponseHelper.error('BAD_REQUEST', 'Invalid courseId parameter');
      }

      const showAllLessons = showAll === '1' || showAll === 'true';

      const reviewData = await this.courseLessonReviewService.getLessonReview(
        courseIdNumber,
        locationId,
        showAllLessons,
      );

      return ResponseHelper.success(reviewData, 'Lesson review data retrieved successfully');
    } catch (error) {
      console.error('Error in getGroupCourseReview controller:', error);

      if (error.message?.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }

      return ResponseHelper.error(
        'INTERNAL_SERVER_ERROR',
        error.message || 'Failed to retrieve lesson review data',
      );
    }
  }

  /**
   * Apply the selected weekday, time, teacher, and duration to conflicted
   * draft lessons in a Group Course. This flow deliberately does not depend
   * on an enrolment, which is absent while a new course is in preview.
   */
  @Post('apply-all')
  @Roles(RolesEnum.BACKEND_USER)
  async applyAllGroupCourseLessons(
    @LocationId() locationId: number,
    @Query('id') lessonId: string,
    @Body() body: UpdateLessonFieldRequestDto,
    @Request() req: any,
  ): Promise<any> {
    try {
      const lessonIdNumber = parseInt(lessonId, 10);
      if (isNaN(lessonIdNumber)) {
        return ResponseHelper.error('BAD_REQUEST', 'Invalid lessonId parameter');
      }

      const userId = req.user?.id || req.user?.userId;
      if (!userId) {
        return ResponseHelper.error('UNAUTHORIZED', 'User not authenticated');
      }

      const result = await this.courseLessonApplyAllService.applyAllGroupCourseLessons(
        lessonIdNumber,
        locationId,
        body,
        userId,
      );
      return ResponseHelper.success(
        result,
        `${result.updatedCount} of ${result.totalCount} lessons updated successfully`,
      );
    } catch (error) {
      console.error('Error in applyAllGroupCourseLessons controller:', error);
      if (error.message?.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      if (error instanceof BadRequestException) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }
      return ResponseHelper.error(
        'INTERNAL_SERVER_ERROR',
        error.message || 'Failed to apply changes to conflicted Group Course lessons',
      );
    }
  }

  /**
   * Delete a lesson from the course review-lesson page
   */
  @Delete('review-lesson/:lessonId')
  @Roles(RolesEnum.BACKEND_USER)
  async deleteReviewLesson(
    @Param('location') locationSlug: string,
    @LocationId() locationId: number,
    @Param('lessonId', ParseIntPipe) lessonId: number,
    @Query('courseId', ParseIntPipe) courseId: number,
    @Request() req: any,
  ): Promise<any> {
    try {
      const loggedUserId = req.user?.id || req.user?.userId;
      if (!loggedUserId) {
        return ResponseHelper.error('UNAUTHORIZED', 'User not authenticated');
      }


      await this.courseReviewLessonDeleteService.deleteReviewLesson({
        courseId: courseId,
        lessonId: lessonId,
        locationId,
        locationSlug,
        loggedUserId,
      });

      return ResponseHelper.success({ lessonId: lessonId }, 'Lesson deleted successfully');
    } catch (error) {
      console.error('Error in deleteReviewLesson controller:', error);

      if (error.message?.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }

      if (error.message?.includes("can't be deleted once invoiced")) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }

      return ResponseHelper.error('INTERNAL_SERVER_ERROR', error.message || 'Failed to delete lesson');
    }
  }

  /**
   * Confirm all lessons for a group course
   * 1. Sets course.isConfirmed = 1
   * 2. For each lesson:
   *    - Creates lesson_hierarchy record (makeAsRoot)
   *    - Sets lesson.isConfirmed = true
   * 
   * After confirmation:
   * - Lessons become "active" and visible in calendar
   * - Lessons can be invoiced
   */
  @Post('confirm')
  @Roles(RolesEnum.BACKEND_USER)
  async confirmLessons(
    @Param('location') locationSlug: string,
    @Body() body: CourseLessonConfirmRequestDto,
  ): Promise<any> {
    try {
      const result = await this.courseLessonConfirmService.confirmGroupCourseLessons(
        body.courseId,
        locationSlug,
      );

      return ResponseHelper.success(result, 'Lessons confirmed successfully');
    } catch (error) {
      console.error('Error in confirmLessons controller:', error);

      if (error.message?.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }

      if (error.message?.includes('already confirmed')) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }

      if (error.message?.includes('No unconfirmed lessons')) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }

      return ResponseHelper.error(
        'INTERNAL_SERVER_ERROR',
        error.message || 'Failed to confirm lessons',
      );
    }
  }
}

