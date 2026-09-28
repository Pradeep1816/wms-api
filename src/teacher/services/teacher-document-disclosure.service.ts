import { BadRequestException, Injectable } from '@nestjs/common';
import { UpdateTeacherDocumentDisclosureDto } from '../dto/teacher-document-disclosure.dto';
import { TeacherDocumentDisclosure } from '../entities/teacher-document-disclosure.entity';
import { TeacherDocumentSignatureRequestType } from '../entities/teacher-document-signature-request.entity';
import { TeacherDocumentDisclosureRepository } from '../repositories/teacher-document-disclosure.repository';

export interface TeacherDocumentDisclosureResponseDto {
  id: number | null;
  documentType: TeacherDocumentSignatureRequestType;
  content: string;
  createdByUser: string | null;
  createdOn: string | null;
  updatedByUser: string | null;
  updatedOn: string | null;
}

@Injectable()
export class TeacherDocumentDisclosureService {
  constructor(
    private readonly disclosureRepository: TeacherDocumentDisclosureRepository,
  ) {}

  async getDisclosures(): Promise<{
    body: TeacherDocumentDisclosureResponseDto[];
  }> {
    const disclosures = await this.disclosureRepository.findAll();

    return {
      body: [
        this.toResponseForType(
          TeacherDocumentSignatureRequestType.INVOICED_LESSONS,
          disclosures,
        ),
        this.toResponseForType(
          TeacherDocumentSignatureRequestType.TIME_VOUCHER,
          disclosures,
        ),
      ],
    };
  }

  async updateDisclosure(
    documentType: TeacherDocumentSignatureRequestType,
    userId: number,
    dto: UpdateTeacherDocumentDisclosureDto,
  ): Promise<{ body: TeacherDocumentDisclosureResponseDto }> {
    if (
      !Object.values(TeacherDocumentSignatureRequestType).includes(documentType)
    ) {
      throw new BadRequestException('Invalid document type');
    }

    const disclosure = await this.disclosureRepository.upsertDisclosure({
      documentType,
      content: dto.content,
      userId,
    });

    const hydrated = await this.disclosureRepository.findByType(documentType);

    return {
      body: this.toResponse(hydrated || disclosure),
    };
  }

  async getDisclosureContent(
    documentType: TeacherDocumentSignatureRequestType,
  ): Promise<string | null> {
    const disclosure = await this.disclosureRepository.findByType(documentType);

    return disclosure?.content?.trim() || null;
  }

  private toResponseForType(
    documentType: TeacherDocumentSignatureRequestType,
    disclosures: TeacherDocumentDisclosure[],
  ): TeacherDocumentDisclosureResponseDto {
    const disclosure = disclosures.find(
      (item) => item.documentType === documentType,
    );

    return disclosure
      ? this.toResponse(disclosure)
      : {
          id: null,
          documentType,
          content: '',
          createdByUser: null,
          createdOn: null,
          updatedByUser: null,
          updatedOn: null,
        };
  }

  private toResponse(
    disclosure: TeacherDocumentDisclosure,
  ): TeacherDocumentDisclosureResponseDto {
    return {
      id: disclosure.id,
      documentType: disclosure.documentType,
      content: disclosure.content,
      createdByUser: this.formatUserName(disclosure.createdByUser),
      createdOn: disclosure.createdOn
        ? disclosure.createdOn.toISOString()
        : null,
      updatedByUser: this.formatUserName(disclosure.updatedByUser),
      updatedOn: disclosure.updatedOn
        ? disclosure.updatedOn.toISOString()
        : null,
    };
  }

  private formatUserName(
    user: { profile?: { firstname?: string; lastname?: string } } | null,
  ): string {
    if (!user?.profile) {
      return 'Unknown User';
    }

    return (
      `${user.profile.firstname || ''} ${user.profile.lastname || ''}`.trim() ||
      'Unknown User'
    );
  }
}
