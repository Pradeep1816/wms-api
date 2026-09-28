export class GroupCourseOptionDto {
  id: string;
  course: string;
  teacher: string;
  day: string;
  rate: number;
  fromTime: string;
  duration: string;
  startDate: string;
  endDate: string;
}

export class FetchGroupCoursesResponseDto {
  data: GroupCourseOptionDto[];
}

