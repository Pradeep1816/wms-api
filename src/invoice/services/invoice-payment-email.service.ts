import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InvoicePaymentEmailRepository } from '../repositories/invoice-payment-email.repository';
import { InvoicePaymentEmailTransformationService } from '../services/transformations/invoice-payment-email-transformation.service';
import { InvoicePaymentEmailDataDto } from '../dto/invoice-payment-email-response.dto';
import { InvoiceEmailTypeEnum } from '../enums/invoice-email-type.enum';
import { InvoicePaymentEmailSendRequestDto } from '../dto/invoice-payment-email-send-request.dto';
import { MailerService } from '../../shared/services/mailer.service';
import { LogRepository } from '../../log/repositories/log.repository';
import { LogObjectRepository } from '../../log/repositories/log-object.repository';
import { LogActivityRepository } from '../../log/repositories/log-activity.repository';
import { LogObjectType } from '../../log/enums/log-object-type.enum';
import { LogActivityType } from '../../log/enums/log-activity.enum';
import { getCurrentESTDate } from '../../utils/date-utils';
import { Payment } from '../../payment/entities/payment.entity';
import { LocationRepository } from '../../location/repositories/location.repository';
@Injectable()
export class InvoicePaymentEmailService {
  private readonly baseUrl = process.env.BASE_URL || '';

  constructor(
    private readonly invoicePaymentEmailRepository: InvoicePaymentEmailRepository,
    private readonly invoicePaymentEmailTransformationService: InvoicePaymentEmailTransformationService,
    private readonly mailerService: MailerService,
    private readonly logRepository: LogRepository,
    private readonly logObjectRepository: LogObjectRepository,
    private readonly logActivityRepository: LogActivityRepository,
    private readonly locationRepository: LocationRepository,
  ) {}

  /**
   * Get payment email data (GET - preview)
   */
  async getPaymentEmail(
    paymentId: number,
    locationId: number,
  ): Promise<InvoicePaymentEmailDataDto> {
    try {
      // Fetch payment with user and payment method
      const payment = await this.invoicePaymentEmailRepository.getPaymentWithUser(
        paymentId,
        locationId,
      );

      if (!payment) {
        throw new NotFoundException('Payment not found');
      }

      const emailTypeId = InvoiceEmailTypeEnum.PAYMENT;

      // Fetch all data in parallel
      const [
        invoicesPaid,
        lessonsPaid,
        groupLessonsPaid,
        paymentsUsed,
        emails,
        emailTemplate,
        hstNumber,
        reminderNotes,
      ] = await Promise.all([
        this.invoicePaymentEmailRepository.getInvoicesPaidByPayment(paymentId),
        this.invoicePaymentEmailRepository.getLessonsPaidByPayment(paymentId),
        this.invoicePaymentEmailRepository.getGroupLessonsPaidByPayment(paymentId),
        this.invoicePaymentEmailRepository.getPaymentsUsed(paymentId),
        payment.user?.id
          ? this.invoicePaymentEmailRepository.getCustomerEmails(payment.user.id)
          : Promise.resolve([]),
        this.invoicePaymentEmailRepository.getEmailTemplate(emailTypeId),
        payment.user?.id
          ? this.invoicePaymentEmailRepository.getHstNumber(payment.user.id)
          : Promise.resolve(null),
        this.invoicePaymentEmailRepository.getReminderNotes(),
      ]);

      // Transform to response format
      const result = this.invoicePaymentEmailTransformationService.transformToResponse(
        payment,
        invoicesPaid,
        lessonsPaid,
        groupLessonsPaid,
        paymentsUsed,
        emails,
        emailTemplate,
        hstNumber,
        reminderNotes,
      );

      return result;
    } catch (error) {
      console.error('Error in getPaymentEmail service:', error);
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException(`Failed to retrieve payment email: ${error.message}`);
    }
  }

  /**
   * Send payment email (POST)
   * Flow: Send email → Create log entry
   */
  async sendPaymentEmail(
    locationSlug:string,
    paymentId: number,
    locationId: number,
    sendEmailDto: InvoicePaymentEmailSendRequestDto,
    currentUserId: number,
  ): Promise<{ body: { paymentId: number; isSent: boolean } }> {
    try {
      // Fetch payment with user + profile for log message
      const payment = await this.invoicePaymentEmailRepository.getPaymentWithUserProfile(
        paymentId,
        locationId,
      );
      if (!payment) {
        throw new NotFoundException(`Payment with id ${paymentId} not found`);
      }

      // Resolve email fields (use DTO or defaults)
      const { to, subject, content } = await this.resolveEmailFields(
        sendEmailDto,
        paymentId,
        locationId,
      );

      // Get location email for from/replyTo
      const location = await this.locationRepository.getLocationDetails(locationId);
      if (!location || !location.email) {
        throw new NotFoundException(`Location email not found for location ${locationId}`);
      }

      // Send email via SMTP
      await this.mailerService.sendEmail({
        from: location.email,
        replyTo: location.email,
        to,
        subject,
        html: content,
      });

      // Create log entry
      await this.createMailedLog(locationSlug,payment, locationId, currentUserId);

      return { body: { paymentId, isSent: true } };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Failed to send payment email: ${error.message}`);
    }
  }

  /**
   * Resolve email fields - use DTO values or fetch defaults from preview
   */
  private async resolveEmailFields(
    dto: InvoicePaymentEmailSendRequestDto,
    paymentId: number,
    locationId: number,
  ): Promise<{ to: string[]; subject: string; content: string }> {
    const hasAllFields = dto.to && dto.to.length > 0 && dto.subject && dto.content;

    if (hasAllFields) {
      return { to: dto.to as string[], subject: dto.subject as string, content: dto.content as string };
    }

    // Fetch defaults from preview endpoint
    const previewData = await this.getPaymentEmail(paymentId, locationId);
    const defaultTo = previewData.body.emailTemplate.to;

    const to = (dto.to && dto.to.length > 0) ? dto.to : (defaultTo ? [defaultTo] : []);
    const subject = dto.subject || previewData.body.emailTemplate.subject || 'Payment from Arcadia Academy of Music';
    const content = dto.content || this.buildDefaultHtmlContent(previewData);

    if (to.length === 0) {
      throw new BadRequestException('At least one recipient email is required');
    }

    return { to, subject, content };
  }

  /**
   * Create payment mailed log entry
   * Inserts: log, log_link (x2), log_history
   */
  private async createMailedLog(
    locationSlug: string,
    payment: Payment,
    locationId: number,
    currentUserId: number,
  ): Promise<void> {
    try {
      const logObject = await this.logObjectRepository.findLogObjectByName(LogObjectType.PAYMENT);
      const logActivity = await this.logActivityRepository.findLogActivityByName(LogActivityType.TYPE_CREATE);

      if (!logObject || !logActivity) {
        console.error('Log object or activity not found for payment mailed log');
        return;
      }

      // Get logged-in user's name
      const loggedUser = await this.invoicePaymentEmailRepository.getUserWithProfile(currentUserId);
      const loggedUserName = loggedUser?.profile
        ? `${loggedUser.profile.firstname || ''} ${loggedUser.profile.lastname || ''}`.trim()
        : loggedUser?.username || 'Unknown';

      // Get customer name
      const customerName = payment.user?.profile
        ? `${payment.user.profile.firstname || ''} ${payment.user.profile.lastname || ''}`.trim()
        : payment.user?.username || 'Unknown';

      // Build payment reference and indexes
      const paymentNumber = payment.reference || `P-${payment.id}`;
      const paymentIndex = `payment (${paymentNumber})`;
      const userIndex = customerName;

      // Build log message with placeholders
      const message = `${loggedUserName} mailed the details of ${paymentIndex} to {{${userIndex}}}`;

      // Serialize payment data
      const paymentData = JSON.stringify({
        id: payment.id,
        user_id: payment.userId,
        amount: payment.amount,
        date: payment.date,
        payment_method_id: payment.paymentMethodId,
        reference: payment.reference,
        notes: payment.notes,
      });

      // Create log + first link + payment history
      const { log } = await this.logRepository.createLog(
        {
          logObjectId: logObject.id,
          logActivityId: logActivity.id,
          message,
          data: paymentData,
          locationId,
          createdOn: getCurrentESTDate(),
          createdUserId: currentUserId,
        },
        {
          index: paymentIndex,
          baseUrl: this.baseUrl,
          path: `/v2/admin/payments/${payment.id}`,
        },
        {
          instanceId: payment.id,
          instanceType: LogObjectType.PAYMENT,
        },
      );

      // Create second log_link (customer link)
      await this.logRepository.createLogLink({
        logId: log.id,
        index: userIndex,
        baseUrl: this.baseUrl,
        path: `/v2/admin/${locationSlug}/customers/${payment.userId}`,
      });

      // Writing the same log into customer history too.
      await this.logRepository.createLogHistory({
        logId: log.id,
        instanceId: payment.userId,
        instanceType: LogObjectType.USER,
      });
    } catch (error) {
      console.error('Error creating payment mailed log:', error);
    }
  }

  /**
   * Build HTML email content from preview data
   */
  private buildDefaultHtmlContent(previewData: InvoicePaymentEmailDataDto): string {
    const { content, emailTemplate } = previewData.body;

    let html = `<div style="max-width: 800px; margin: 0 auto; line-height: 1.5; color: #444; font-family: sans-serif;">`;
    
    // Header
    html += emailTemplate.header || '';

    // Acknowledgment
    html += `<p style="margin: 20px 0;">${content.acknowledgment}</p>`;

    // Lessons table (if exists)
    if (content.lessons && content.lessons.length > 0) {
      html += `<h4 style="margin: 20px 0 10px 0;">Lessons</h4>`;
      html += `<table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <thead>
          <tr style="border-bottom: 2px solid #f0f0f0; text-align: left;">
            <th style="padding: 8px; font-size: 13px;">Original Date</th>
            <th style="padding: 8px; font-size: 13px;">Date</th>
            <th style="padding: 8px; font-size: 13px;">Student</th>
            <th style="padding: 8px; font-size: 13px;">Program</th>
            <th style="padding: 8px; font-size: 13px;">Teacher</th>
            <th style="padding: 8px; font-size: 13px; text-align: right;">Amount</th>
            <th style="padding: 8px; font-size: 13px; text-align: right;">Payment</th>
            <th style="padding: 8px; font-size: 13px; text-align: right;">Balance</th>
          </tr>
        </thead>
        <tbody>`;
      
      content.lessons.forEach(lesson => {
        html += `<tr style="border-bottom: 1px solid #f9f9f9;">
          <td style="padding: 8px; font-size: 12px;">${lesson.originalDate}</td>
          <td style="padding: 8px; font-size: 12px;">${lesson.date}</td>
          <td style="padding: 8px; font-size: 12px;">${lesson.student}</td>
          <td style="padding: 8px; font-size: 12px;">${lesson.program}</td>
          <td style="padding: 8px; font-size: 12px;">${lesson.teacher}</td>
          <td style="padding: 8px; font-size: 12px; text-align: right;">${lesson.amount}</td>
          <td style="padding: 8px; font-size: 12px; text-align: right;">${lesson.payment}</td>
          <td style="padding: 8px; font-size: 12px; text-align: right;">${lesson.balance}</td>
        </tr>`;
      });
      
      html += `</tbody></table>`;
    }

    // Group Lessons table (if exists)
    if (content.groupLessons && content.groupLessons.length > 0) {
      html += `<h4 style="margin: 20px 0 10px 0;">Group Lessons</h4>`;
      html += `<table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <thead>
          <tr style="border-bottom: 2px solid #f0f0f0; text-align: left;">
            <th style="padding: 8px; font-size: 13px;">Original Date</th>
            <th style="padding: 8px; font-size: 13px;">Date</th>
            <th style="padding: 8px; font-size: 13px;">Student</th>
            <th style="padding: 8px; font-size: 13px;">Program</th>
            <th style="padding: 8px; font-size: 13px;">Teacher</th>
            <th style="padding: 8px; font-size: 13px; text-align: right;">Amount</th>
            <th style="padding: 8px; font-size: 13px; text-align: right;">Payment</th>
            <th style="padding: 8px; font-size: 13px; text-align: right;">Balance</th>
          </tr>
        </thead>
        <tbody>`;
      
      content.groupLessons.forEach(lesson => {
        html += `<tr style="border-bottom: 1px solid #f9f9f9;">
          <td style="padding: 8px; font-size: 12px;">${lesson.originalDate}</td>
          <td style="padding: 8px; font-size: 12px;">${lesson.date}</td>
          <td style="padding: 8px; font-size: 12px;">${lesson.student}</td>
          <td style="padding: 8px; font-size: 12px;">${lesson.program}</td>
          <td style="padding: 8px; font-size: 12px;">${lesson.teacher}</td>
          <td style="padding: 8px; font-size: 12px; text-align: right;">${lesson.amount}</td>
          <td style="padding: 8px; font-size: 12px; text-align: right;">${lesson.payment}</td>
          <td style="padding: 8px; font-size: 12px; text-align: right;">${lesson.balance}</td>
        </tr>`;
      });
      
      html += `</tbody></table>`;
    }

    // Invoices table (if exists)
    if (content.invoices && content.invoices.length > 0) {
      html += `<h4 style="margin: 20px 0 10px 0;">Invoices</h4>`;
      html += `<table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <thead>
          <tr style="border-bottom: 2px solid #f0f0f0; text-align: left;">
            <th style="padding: 8px; font-size: 13px;">Date</th>
            <th style="padding: 8px; font-size: 13px;">Number</th>
            <th style="padding: 8px; font-size: 13px; text-align: right;">Amount</th>
            <th style="padding: 8px; font-size: 13px; text-align: right;">Payment</th>
            <th style="padding: 8px; font-size: 13px; text-align: right;">Balance</th>
          </tr>
        </thead>
        <tbody>`;
      
      content.invoices.forEach(invoice => {
        html += `<tr style="border-bottom: 1px solid #f9f9f9;">
          <td style="padding: 8px; font-size: 12px;">${invoice.date}</td>
          <td style="padding: 8px; font-size: 12px;">${invoice.number}</td>
          <td style="padding: 8px; font-size: 12px; text-align: right;">${invoice.amount}</td>
          <td style="padding: 8px; font-size: 12px; text-align: right;">${invoice.payment}</td>
          <td style="padding: 8px; font-size: 12px; text-align: right;">${invoice.balance}</td>
        </tr>`;
      });
      
      html += `</tbody></table>`;
    }

    // Payments Used table
    html += `<h4 style="margin: 20px 0 10px 0;">Payments Used</h4>`;
    html += `<table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
      <thead>
        <tr style="border-bottom: 2px solid #f0f0f0; text-align: left;">
          <th style="padding: 8px; font-size: 13px;">Reference</th>
          <th style="padding: 8px; font-size: 13px;">Date</th>
          <th style="padding: 8px; font-size: 13px;">Payment Method</th>
          <th style="padding: 8px; font-size: 13px; text-align: right;">Amount</th>
        </tr>
      </thead>
      <tbody>`;
    
    content.paymentsUsed.forEach(payment => {
      html += `<tr style="border-bottom: 1px solid #f9f9f9;">
        <td style="padding: 8px; font-size: 12px;">${payment.reference}</td>
        <td style="padding: 8px; font-size: 12px;">${payment.date}</td>
        <td style="padding: 8px; font-size: 12px;">${payment.paymentMethod}</td>
        <td style="padding: 8px; font-size: 12px; text-align: right;">${payment.amount}</td>
      </tr>`;
    });
    
    html += `</tbody></table>`;

    // HST Number
    if (content.hstNumber) {
      html += `<p style="font-size: 12px; color: #888; margin-top: 30px; border-top: 1px solid #eee; padding-top: 10px;"><strong>HST#</strong> ${content.hstNumber}</p>`;
    }

    // Footer
    html += `<div style="margin-top: 20px;">${emailTemplate.footer || ''}</div>`;
    
    html += `</div>`;

    return html;
  }
}
