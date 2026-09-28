import { GroupLessonDueRequestDto } from '../dto/group-lesson-due-request.dto';
import { GroupLessonDueDataDto } from '../dto/group-lesson-due-response.dto';

export interface IGroupLessonDueQueryService {
  getGroupLessonDuesByCustomerId(
    locationSlug: string,
    customerId: number,
    query: GroupLessonDueRequestDto,
  ): Promise<GroupLessonDueDataDto>;
}


export interface IGroupLessonDueTransformationService {
  transformToDto(lesson: any, locationSlug: string): any;
  transformLessonsToDtos(lessons: any[], locationSlug: string): any[];
}

export interface IGroupLessonDueCalculationService {
  calculateLessonAmount(groupLesson: any): number;
  calculateTotalAmount(lessons: any[]): number;
  calculatePagination(total: number, page: number, limit: number): {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
