export class EmailStatementDataDto {
  privateLessonsDue: Array<{
    lessonDate: string;
    studentName: string;
    programName: string;
    teacherName: string;
    amount: number | string;
  }>;
  groupLessonsDue: Array<{
    lessonDate: string;
    studentName: string;
    programName: string;
    teacherName: string;
    amount: number | string;
  }>;
  invoices: Array<{
    id: string;
    date: string;
    status: string;
    total: number;
    balance: number;
  }>;
  credits: Array<{
    id: number;
    type: string;
    reference: string;
    amount: number;
  }>;
  totalBalance: number;
  customerEmails: string[];
  emailSubject: string;
  emailHeader: string;
  emailFooter: string;
}

export class EmailStatementResponseDto {
  body: EmailStatementDataDto;
}
