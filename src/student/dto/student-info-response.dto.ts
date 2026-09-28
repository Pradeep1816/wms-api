import { Expose, Type } from 'class-transformer';

export class CustomerInfoDto {
  @Expose()
  id: number;

  @Expose()
  name: string;

  @Expose()
  phone: string;
}

export class PrivateLessonDefaultsDto {
  @Expose()
  courseId: number;

  @Expose()
  programId: number;

  @Expose()
  teacherId: number;

  @Expose()
  programName?: string;

  @Expose()
  teacherName?: string;
}

export class StudentInfoDto {
  @Expose()
  id: number;

  @Expose()
  fullName: string;

  @Expose()
  birthDate: string;

  @Expose()
  age: string;

  @Expose()
  gender: string;

  @Expose()
  status: string;

  @Expose()
  note: string;

  @Expose()
  mediaAndOnlineLessonConsent: boolean | null;
}

export class StudentDetailsDataDto {
  @Expose()
  @Type(() => StudentInfoDto)
  student: StudentInfoDto;

  @Expose()
  @Type(() => CustomerInfoDto)
  customer: CustomerInfoDto;

  @Expose()
  @Type(() => PrivateLessonDefaultsDto)
  privateLessonDefaults?: PrivateLessonDefaultsDto | null;
}

export class StudentDetailsResponseDto {
  @Expose()
  @Type(() => StudentDetailsDataDto)
  body: StudentDetailsDataDto;
}
