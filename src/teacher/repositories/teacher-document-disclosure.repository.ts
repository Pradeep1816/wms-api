import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TeacherDocumentDisclosure } from '../entities/teacher-document-disclosure.entity';
import { TeacherDocumentSignatureRequestType } from '../entities/teacher-document-signature-request.entity';

@Injectable()
export class TeacherDocumentDisclosureRepository {
  constructor(
    @InjectRepository(TeacherDocumentDisclosure)
    private readonly repository: Repository<TeacherDocumentDisclosure>,
  ) {}

  findAll(): Promise<TeacherDocumentDisclosure[]> {
    return this.repository.find({
      relations: [
        'createdByUser',
        'createdByUser.profile',
        'updatedByUser',
        'updatedByUser.profile',
      ],
      order: {
        documentType: 'ASC',
      },
    });
  }

  findByType(
    documentType: TeacherDocumentSignatureRequestType,
  ): Promise<TeacherDocumentDisclosure | null> {
    return this.repository.findOne({
      where: {
        documentType,
      },
      relations: [
        'createdByUser',
        'createdByUser.profile',
        'updatedByUser',
        'updatedByUser.profile',
      ],
    });
  }

  async upsertDisclosure(params: {
    documentType: TeacherDocumentSignatureRequestType;
    content: string;
    userId: number;
  }): Promise<TeacherDocumentDisclosure> {
    const now = new Date();
    const existing = await this.repository.findOne({
      where: {
        documentType: params.documentType,
      },
    });

    if (existing) {
      existing.content = params.content;
      existing.updatedByUserId = params.userId;
      existing.updatedOn = now;
      return this.repository.save(existing);
    }

    return this.repository.save(
      this.repository.create({
        documentType: params.documentType,
        content: params.content,
        createdByUserId: params.userId,
        updatedByUserId: params.userId,
        createdOn: now,
        updatedOn: now,
      }),
    );
  }
}
