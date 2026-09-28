import { Injectable } from "@nestjs/common"; 
import { plainToInstance } from "class-transformer";
import { TeacherDocumentSignatureRejectionResponseDto } from "src/teacher/dto/teacher-document-signature-rejection-response.dto";
import { TeacherDocumentSignatureRequest } from "src/teacher/entities/teacher-document-signature-request.entity";

@Injectable()
export class TeacherDocumentSignatureTransformationService {
  transformRejection(entity: TeacherDocumentSignatureRequest) {
    const dtoData = {
      id: entity.id,
      teacherId: entity.teacherId,
      documentType: entity.documentType,
      status: entity.status,
      rejectedAt: entity.updatedOn,
    };

    return plainToInstance(
      TeacherDocumentSignatureRejectionResponseDto,
      dtoData,
      { excludeExtraneousValues: true },
    );
  }
}