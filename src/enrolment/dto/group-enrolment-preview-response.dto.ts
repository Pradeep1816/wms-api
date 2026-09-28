export class LessonPreviewDto {
  id: number;
  dateTime: string; // ISO date string
  duration: string; // HH:mm format
  price: number; // grossPrice
  discount: number; // calculated discount
  total: number; // price - discount
}

export class GroupEnrolmentPreviewResponseDto {
  enrolmentId: number;
  lessons: LessonPreviewDto[];
}

