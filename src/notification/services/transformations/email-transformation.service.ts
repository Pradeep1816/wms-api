import { Injectable } from '@nestjs/common';
import { EmailResponseDto } from 'src/notification/dto/email-response.dto';
import { EmailTemplate } from 'src/notification/entities/email-template.entity';


@Injectable()
export class EmailTransformationService {
  
  transformRow(template: EmailTemplate): EmailResponseDto {
    return {
      id: template.id,
      type: template.emailObject?.name, 
      subject: template.subject,
      header: template.header,
      footer: template.footer,
    };
  }

  transformRows(templates: EmailTemplate[]): EmailResponseDto[] {
    return templates.map(t => this.transformRow(t));
  }
}
