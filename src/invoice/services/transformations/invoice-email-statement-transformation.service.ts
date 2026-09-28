import { Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { Invoice } from '../../entities/invoice.entity';
import { EmailTemplate } from '../../../notification/entities/email-template.entity';
import {
  InvoiceEmailStatementDataDto,
  EmailTemplateDto,
  InvoiceContentDto,
} from '../../dto/invoice-email-statement-response.dto';

@Injectable()
export class InvoiceEmailStatementTransformationService {
  /**
   * Transform raw data to email statement response DTO
   */
  transformToResponse(
    invoice: Invoice,
    lineItems: any[],
    payments: any[],
    totals: any,
    emails: string[],
    emailTemplate: EmailTemplate | null,
    hstNumber: string | null,
    reminderNotes: string | null,
  ): InvoiceEmailStatementDataDto {
    const content = this.formatInvoiceContent(
      lineItems,
      invoice.notes,
      payments,
      totals,
      hstNumber,
    );

    const template = this.formatEmailTemplate(emailTemplate, invoice, emails, reminderNotes);

    const responseData = {
      body: {
        content,
        emailTemplate: template,
      },
    };

    return plainToInstance(InvoiceEmailStatementDataDto, responseData, {
      excludeExtraneousValues: true,
    });
  }

  /**
   * Format invoice content as structured data
   */
  private formatInvoiceContent(
    lineItems: any[],
    notes: string | null,
    payments: any[],
    totals: any,
    hstNumber: string | null,
  ): InvoiceContentDto {
    const content: InvoiceContentDto = {
      lineItems,
      message: notes,
      totals,
      hstNumber,
    };

    // Only include payments if there are any
    if (payments && payments.length > 0) {
      content.payments = payments;
    }

    return content;
  }
  /**
   * Format email template data
   */
  private formatEmailTemplate(
    emailTemplate: EmailTemplate | null,
    invoice: Invoice,
    emails: string[],
    reminderNotes: string | null,
  ): EmailTemplateDto {
    // Use first email if available, otherwise empty string
    const customerEmail = emails.length > 0 ? emails[0] : '';

    if (emailTemplate) {
      // Concatenate footer with reminder notes (policies)
      const footer = emailTemplate.footer || '';
      const fullFooter = reminderNotes ? `${footer}\n${reminderNotes}` : footer;

      return {
        id: emailTemplate.id,
        to: customerEmail,
        subject: emailTemplate.subject,
        header: emailTemplate.header || '',
        footer: fullFooter,
      };
    }

    // Default template if not found
    const defaultFooter = '<p style="text-align: left;">Thank you,<br>Arcadia Academy of Music Administration</p>';
    const fullFooter = reminderNotes ? `${defaultFooter}\n${reminderNotes}` : defaultFooter;

    return {
      id: 0,
      to: customerEmail,
      subject: 'Invoice from Arcadia Academy of Music',
      header: '<p style="text-align: left;">Dear Valued Client,<br><br>Please see invoice below</p>',
      footer: fullFooter,
    };
  }
}
