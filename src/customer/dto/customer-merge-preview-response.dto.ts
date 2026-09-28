import { Expose } from 'class-transformer';

export class MergePreviewUserDto {
    @Expose()
    id: number;

    @Expose()
    isActive: boolean;

    @Expose()
    fullName: string;
}

export class MergePreviewEnrolmentDto {
    @Expose()
    id: number;

    @Expose()
    studentName: string;

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
    renewalDate: string;
}

export class MergePreviewStudentDto {
    @Expose()
    id: number;

    @Expose()
    fullName: string;
}

export class MergePreviewPaymentRequestDto {
    @Expose()
    id: number;
}

export class MergePreviewDataDto {
    @Expose()
    body: {
        primaryCandidate: MergePreviewUserDto;
        duplicateCandidate: MergePreviewUserDto;
        students: MergePreviewStudentDto[];
        enrolments: MergePreviewEnrolmentDto[];
    };
}


