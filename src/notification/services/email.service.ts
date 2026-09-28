import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EmailRequestDto } from '../dto/email-request.dto';
import { EmailListResponseDto } from '../dto/email-response.dto';
import { EmailTemplateRepository } from '../repositories/email.repository';
import { EmailTransformationService } from './transformations/email-transformation.service';
import { UpdateEmailTemplateRequestDto } from '../dto/update-email-template-request.dto';
import { UpdateEmailTemplateResponseDto } from '../dto/update-email-template-response.dto';
import { EmailTemplateObjectResponseDto } from '../dto/email-template-object-response.dto';
import { formatDate } from '../../utils/date-utils';
import { plainToInstance } from 'class-transformer';

@Injectable()
export class EmailTemplateService {
  constructor(
    private readonly emailTemplateRepo: EmailTemplateRepository,
    private readonly transformService: EmailTransformationService,
  ) {}

  async getEmailTemplates(query: EmailRequestDto): Promise<EmailListResponseDto> {
    const {
      page,
      limit,
    } = query;

 
    const { items, total } =
    await this.emailTemplateRepo.findEmailTemplates(page, limit);

  
    const body = this.transformService.transformRows(items);

    const pagination = {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };

   
    return {
      body,
      pagination,
    };
  }

  async updateEmailTemplate(
    id: number,
    updateDto: UpdateEmailTemplateRequestDto,
  ): Promise<UpdateEmailTemplateResponseDto> {
    try {
      const updatedEmailTemplate = await this.emailTemplateRepo.updateEmailTemplate(
        id,
        updateDto,
      );

      const response = plainToInstance(
        UpdateEmailTemplateResponseDto,
        {
          id: updatedEmailTemplate.id,
          type: updatedEmailTemplate.emailObject?.name,
          subject: updatedEmailTemplate.subject,
          header: updatedEmailTemplate.header,
          footer: updatedEmailTemplate.footer,
          updatedAt: formatDate(updatedEmailTemplate.updatedAt),
        },
        { excludeExtraneousValues: true },
      );

      return response;
    } catch (error) {
      console.error('Error in updateEmailTemplate service:', error);

      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }

      throw new BadRequestException('Failed to update email template');
    }
  }

  async getEmailTemplateByObjectId(
    objectId: number,
  ): Promise<EmailTemplateObjectResponseDto> {
    const template = await this.emailTemplateRepo.findEmailTemplateByObjectId(objectId);

    if (!template) {
      throw new NotFoundException(`Email template not found for object ID ${objectId}`);
    }

    return plainToInstance(
      EmailTemplateObjectResponseDto,
      {
        subject: template.subject,
        header: template.header,
        footer: template.footer,
      },
      { excludeExtraneousValues: true },
    );
  }
}
