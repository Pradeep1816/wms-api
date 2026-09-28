import {
  Controller,
  Get,
  Put,
  Delete,
  Param,
  Query,
  Body,
  Request,
  UseGuards,
  ParseIntPipe,
  ValidationPipe,
  NotFoundException,
} from '@nestjs/common';
import { CourseDetailsService } from '../services/course-details.service';
import { CourseLessonService } from '../services/course-lesson.service';
import { CourseStudentService } from '../services/course-student.service';
import { CourseLessonEditOnlineTypeService } from '../services/course-lesson-edit-online-type.service';
import { CourseDeleteService } from '../services/course-delete.service';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { LocationResolveGuard } from '../../shared/guards/location.guard';
import { LocationId } from '../../shared/decorators/location-id.decorator';
import { ResponseHelper } from '../../shared/helpers/response.helper';
import { CourseDetailsDataDto } from '../dto/course-details-response.dto';
import { CourseLessonRequestDto } from '../dto/course-lesson-request.dto';
import { CourseLessonDataDto } from '../dto/course-lesson-response.dto';
import { CourseStudentDataDto } from '../dto/course-student-response.dto';
import { CourseStudentRequestDto } from '../dto/course-student-request.dto';
import { CourseLessonEditOnlineTypeDto } from '../dto/course-lesson-edit-online-type.dto';

@Controller('admin/v2/:location/course')
@UseGuards(AuthGuard, RolesGuard, LocationResolveGuard)
export class CourseDetailsController {
  constructor(
    private readonly courseDetailsService: CourseDetailsService,
    private readonly courseLessonService: CourseLessonService,
    private readonly courseStudentService: CourseStudentService,
    private readonly courseLessonEditOnlineTypeService: CourseLessonEditOnlineTypeService,
    private readonly courseDeleteService: CourseDeleteService,
  ) {}

  /**
   * Get course details by ID
   * GET /admin/v2/:location/course/:id/info
   */
  @Get(':id/info')
  @Roles(RolesEnum.BACKEND_USER)
  async getCourseDetails(
    @LocationId() locationId: number,
    @Param('id') id: number,
  ): Promise<CourseDetailsDataDto | any> {
    try {
      const result = await this.courseDetailsService.getCourseDetails(
        locationId,
        id,
      );

      return ResponseHelper.success(result, 'Course details retrieved successfully');
    } catch (error) {
      console.error('Error in getCourseDetails controller:', error);
      if (error instanceof NotFoundException) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      return ResponseHelper.error(
        'INTERNAL_SERVER_ERROR',
        'Failed to retrieve course details',
      );
    }
  }

  /**
   * Get lessons for a specific course
   * GET /admin/v2/:location/course/:id/lessons
   */
  @Get(':id/lessons')
  @Roles(RolesEnum.BACKEND_USER)
  async getCourseLessons(
    @LocationId() locationId: number,
    @Param('id') id: number,
    @Query(ValidationPipe) query: CourseLessonRequestDto,
  ): Promise<CourseLessonDataDto | any> {
    try {
      const result = await this.courseLessonService.getCourseLessons(
        locationId,
        id,
        query,
      );

      return ResponseHelper.success(
        result,
        'Course lessons retrieved successfully',
      );
    } catch (error) {
      console.error('Error in getCourseLessons controller:', error);
      return ResponseHelper.error('NOT_FOUND', error.message);
    }
  }

  /**
   * Get students enrolled in a course
   * GET /admin/v2/:location/course/:id/students
   */
  @Get(':id/students')
  @Roles(RolesEnum.BACKEND_USER)
  async getCourseStudents(
    @Param('id') id: number,
    @Query(ValidationPipe) query: CourseStudentRequestDto,
  ): Promise<CourseStudentDataDto | any> {
    try {
      const result = await this.courseStudentService.getCourseStudents(id, query);

      return ResponseHelper.success(
        result,
        'Course students retrieved successfully',
      );
    } catch (error) {
      console.error('Error in getCourseStudents controller:', error);
      return ResponseHelper.error('NOT_FOUND', error.message);
    }
  }

  /**
   * Edit online type for group lessons
   * PUT /admin/v2/:location/course/edit-online-type/:id
   */
  @Put('edit-online-type/:id')
  @Roles(RolesEnum.BACKEND_USER)
  async editOnlineType(
    @LocationId() locationId: number,
    @Param('id', ParseIntPipe) courseId: number,
    @Body() body: CourseLessonEditOnlineTypeDto,
    @Request() req: any,
  ): Promise<any> {
    try {
      const loggedUserId = req.user?.id || req.user?.userId;
      if (!loggedUserId) {
        return ResponseHelper.error('UNAUTHORIZED', 'User not authenticated');
      }

      const result = await this.courseLessonEditOnlineTypeService.editOnlineType(
        courseId,
        body,
        locationId,
        loggedUserId,
      );

      if (!result.status) {
        return ResponseHelper.error('BAD_REQUEST', result.error || 'Failed to update online type');
      }

      return ResponseHelper.success(
        { courseId: result.courseId, updatedBy: result.updatedBy },
        result.message || 'Online type updated successfully',
      );
    } catch (error) {
      console.error('Error in editOnlineType controller:', error);
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', error.message || 'Failed to update online type');
    }
  }

  /**
   * Delete a group course (soft delete)
   * DELETE /admin/v2/:location/course/:id
   */
  @Delete(':id')
  @Roles(RolesEnum.BACKEND_USER)
  async deleteGroupCourse(
    @Param('location') locationSlug: string,
    @LocationId() locationId: number,
    @Param('id', ParseIntPipe) courseId: number,
    @Request() req: any,
  ): Promise<any> {
    try {
      const loggedUserId = req.user?.id || req.user?.userId;
      if (!loggedUserId) {
        return ResponseHelper.error('UNAUTHORIZED', 'User not authenticated');
      }

      const result = await this.courseDeleteService.deleteGroupCourse(
        courseId,
        locationId,
        locationSlug,
        loggedUserId,
      );

      if (!result.status) {
        return ResponseHelper.error('BAD_REQUEST', result.error);
      }

      return ResponseHelper.success({ url: result.url }, 'Group course deleted successfully');
    } catch (error) {
      console.error('Error in deleteGroupCourse controller:', error);
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', error.message || 'Failed to delete group course');
    }
  }
}
