    import { Expose } from 'class-transformer';
    import { TeacherDocumentSignatureRequestStatus, TeacherDocumentSignatureRequestType } from '../entities/teacher-document-signature-request.entity';

    export class TeacherDocumentSignatureRejectionResponseDto {
    @Expose()
    id: number;

    @Expose()
    teacherId: number;

    @Expose()
    status: TeacherDocumentSignatureRequestStatus; 

    @Expose()
    documentType: TeacherDocumentSignatureRequestType;

    @Expose()
    rejectedAt: Date;
    }