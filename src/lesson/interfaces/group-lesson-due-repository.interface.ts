export interface IGroupLessonDueQueryRepository {
  getGroupLessonDuesByCustomerId(
    customerId: number,
    locationId: number,
    page: number,
    limit: number,
    startDate?: string,
    endDate?: string,
    studentId?: number,
  ): Promise<{ groupLessonDues: any[]; total: number }>;
}
