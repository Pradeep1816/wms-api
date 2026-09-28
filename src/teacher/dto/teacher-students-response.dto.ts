import { Expose } from 'class-transformer';

export class TeacherStudentDto {
  @Expose()
  id: number;

  @Expose()
  fullName: string;
}

export class TeacherStudentsResponseDto {
  @Expose()
  body: TeacherStudentDto[];

  @Expose()
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

