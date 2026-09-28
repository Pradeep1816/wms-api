import { Expose } from 'class-transformer';

export class StudentEnrolmentDto {
  @Expose()
  id: number;

  @Expose()
  courseId?: number; // Optional: included when creating enrolment for review

  @Expose()
  programId?: number;

  @Expose()
  teacherId?: number;

  @Expose()
  programName: string;

  @Expose()
  teacherName: string;

  @Expose()
  day: string;

  @Expose()
  fromTime: string;

  @Expose()
  duration: string;

  @Expose()
  startDate: string;

  @Expose()
  endDate: string;
}

export class StudentEnrolmentsDataDto {
  @Expose()
  body: StudentEnrolmentDto[];

  @Expose()
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export class StudentEnrolmentsResponseDto {
  @Expose()
  success: boolean = true;

  @Expose()
  message: string = 'Student enrolments retrieved successfully';

  @Expose()
  data: StudentEnrolmentsDataDto;
}
