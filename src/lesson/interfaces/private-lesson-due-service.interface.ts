import { PrivateLessonDueRequestDto } from '../dto/private-lesson-due-request.dto';
import { PrivateLessonDueDataDto, PrivateLessonDueDto } from '../dto/private-lesson-due-response.dto';

export interface IPrivateLessonDueQueryService {
  getPrivateLessonDuesByCustomerId(
    locationSlug: string,
    customerId: number,
    query: PrivateLessonDueRequestDto,
  ): Promise<PrivateLessonDueDataDto>;
}

export interface IPrivateLessonDueTransformationService {
  transformToDto(lesson: any, locationSlug: string): PrivateLessonDueDto;
  transformLessonsToDtos(lessons: any[], locationSlug: string): PrivateLessonDueDto[];
}

export interface IPrivateLessonDueCalculationService {
  calculateLessonAmount(privateLesson: any): number;
  calculateTotalAmount(lessons: any[]): number;
  calculatePagination(total: number, page: number, limit: number): {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
