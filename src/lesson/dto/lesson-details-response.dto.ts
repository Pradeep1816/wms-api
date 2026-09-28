import { Expose, Type } from 'class-transformer';

export class StudentInfo {
  @Expose()
  studentId: number;

  @Expose()
  customerId: number;

  @Expose()
  studentName: string;

  @Expose()
  customerName: string;

  @Expose()
  phoneNumber: string | null;
}

export class LessonInfo {
  @Expose()
  id: number;

  @Expose()
  programName: string;

  @Expose()
  classroomName: string;

  @Expose()
  status: string;

  @Expose()
  colorCode: string | null;

  @Expose()
  isOnline: string;
  
  @Expose()
  isPrivate: boolean;

  @Expose()
  isGroup: boolean;
}

export class ScheduleInfo {
  @Expose()
  teacher: string;

  @Expose()
  teacherId: number;

  @Expose()
  originalDate: string | null;

  @Expose()
  scheduledDate: string | null;

  @Expose()
  time: string | null;

  @Expose()
  duration: string | null;

  @Expose()
  expiryDate: string | null;
}

export class DueDateInfo {
  @Expose()
  dueDate: string | null;
}


export class AttendanceInfo {
  @Expose()
  present: string;
}

export class CostInfo {
  @Expose()
  costPerHour: string;

  @Expose()
  cost: string;

  @Expose()
  price: string | null;

  @Expose()
  profit: string | null;

  @Expose()
  costPerStudent: string | null;
}

export class TotalsInfo {
  @Expose()
  lessonRatePerHour: string;

  @Expose()
  qty: number;

  @Expose()
  lessonPrice: string;

  @Expose()
  discount: string;

  @Expose()
  subTotal: string;

  @Expose()
  tax: string;

  @Expose()
  total: string;

  @Expose()
  paid: string;

  @Expose()
  balance: string;

  @Expose()
  invoiceId: number | null;

  @Expose()
  invoiceNumber: string | null;

  @Expose()
  invoiceOwing: string | null;
}

export class LessonDetails {
  @Expose()
  @Type(() => LessonInfo)
  lesson: LessonInfo;

  @Expose()
  @Type(() => StudentInfo)
  student: StudentInfo | null;

  @Expose()
  @Type(() => ScheduleInfo)
  schedule: ScheduleInfo;

  @Expose()
  @Type(() => DueDateInfo)
  dueDate: DueDateInfo | null;


  @Expose()
  @Type(() => AttendanceInfo)
  attendance: AttendanceInfo | null;

  @Expose()
  @Type(() => CostInfo)
  cost: CostInfo;

  @Expose()
  @Type(() => TotalsInfo)
  totals: TotalsInfo | null;
}

export class LessonDetailsResponse {
  @Expose()
  @Type(() => LessonDetails)
  body: LessonDetails;
}
