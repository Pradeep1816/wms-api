import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { CourseDeleteRepository } from '../repositories/course-delete.repository';

@Injectable()
export class CourseDeleteService {
  constructor(
    private readonly courseDeleteRepository: CourseDeleteRepository,
  ) {}

  /**
   * Delete a group course
   */
  async deleteGroupCourse(
    courseId: number,
    locationId: number,
    locationSlug: string,
    userId: number,
  ): Promise<any> {
    // 1. Find the course
    const course = await this.courseDeleteRepository.findCourseById(courseId, locationId);
    
    if (!course) {
      throw new NotFoundException(`Course with ID ${courseId} not found`);
    }

    // 2. Check delete conditions
    // No confirmed enrolments
    const hasConfirmedEnrolment = await this.courseDeleteRepository.hasConfirmedEnrolment(courseId);
    
    // Is a group program
    const isGroupProgram = await this.courseDeleteRepository.isGroupProgram(course.programId);

    // Both conditions must be met: no confirmed enrolment AND is group program
    if (hasConfirmedEnrolment || !isGroupProgram) {
      return {
        status: false,
        error: 'Course not deleted because course associated with enrolment',
      };
    }

    // 3. Execute delete transaction
    try {
      await this.courseDeleteRepository.executeDeleteTransaction(courseId, userId);

      return {
        status: true,
        url: `admin/v2/${locationSlug}/group-courses`,
      };
    } catch (error) {
      console.error('Error deleting group course:', error);
      throw new BadRequestException('Failed to delete course');
    }
  }
}
