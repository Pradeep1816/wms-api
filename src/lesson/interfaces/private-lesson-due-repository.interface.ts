export interface IPrivateLessonDueQueryRepository {
  getPrivateLessonDuesByCustomerId(
    customerId: number,
    locationId: number,
    page: number,
    limit: number,
    startDate?: string,
    endDate?: string,
    studentId?: number,
  ): Promise<{ privateLessonDues: any[]; total: number }>;
}
