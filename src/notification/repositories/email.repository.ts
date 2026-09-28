import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmailTemplate } from '../entities/email-template.entity';
import { EmailObject } from '../entities/email-object.entity';
import { UpdateEmailTemplateRequestDto } from '../dto/update-email-template-request.dto';
import { getCurrentESTDate } from '../../utils/date-utils';

@Injectable()
export class EmailTemplateRepository {
  constructor(
    @InjectRepository(EmailTemplate)
    private readonly emailTemplateRepo: Repository<EmailTemplate>,

    @InjectRepository(EmailObject)
    private readonly emailObjectRepo: Repository<EmailObject>,
  ) {}

  async findEmailTemplates(
    page: number = 1,
    limit: number = 20,
  ) {
    const query = this.emailTemplateRepo
      .createQueryBuilder('emailTemplate')
      .leftJoinAndSelect('emailTemplate.emailObject', 'emailObject');
    const total = await query.getCount();
    const items = await query
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();
    return { items, total };
  }

  async findEmailTemplateByObjectId(emailTypeId: number) {
    return this.emailTemplateRepo
      .createQueryBuilder('emailTemplate')
      .leftJoinAndSelect('emailTemplate.emailObject', 'emailObject')
      .where('emailTemplate.emailTypeId = :emailTypeId', { emailTypeId })
      .getOne();
  }

  private async getExistingEmailTemplate(id: number, queryRunner: any) {
    return await queryRunner.manager.findOne(EmailTemplate, {
      where: { id },
      relations: ['emailObject'],
    });
  }

  async updateEmailTemplate(
    id: number,
    updateDto: UpdateEmailTemplateRequestDto,
  ) {
    const { subject, header, footer } = updateDto;

    const queryRunner =
      this.emailTemplateRepo.manager.connection.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const existingTemplate = await this.getExistingEmailTemplate(id, queryRunner);

      if (!existingTemplate) {
        throw new NotFoundException('Email template not found');
      }

      const updateData: any = {};

      if (subject) {
        updateData.subject = subject;
      }

      if (header) {
        updateData.header = header;
      }

      if (footer) {
        updateData.footer = footer;
      }

      updateData.updatedAt = getCurrentESTDate();

      await queryRunner.manager
        .createQueryBuilder()
        .update(EmailTemplate)
        .set(updateData)
        .where('id = :id', { id })
        .execute();

      const updatedTemplate = await queryRunner.manager.findOne(EmailTemplate, {
        where: { id },
        relations: ['emailObject'],
      });

      if (!updatedTemplate) {
        throw new Error('Failed to fetch updated email template');
      }

      await queryRunner.commitTransaction();

      return updatedTemplate;

    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;

    } finally {
      await queryRunner.release();
    }
  }
}
