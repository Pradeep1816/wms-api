import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InvoiceEmailStatementRepository } from '../repositories/invoice-email-statement.repository';
import { InvoiceEmailStatementTransformationService } from './transformations/invoice-email-statement-transformation.service';
import { InvoiceDetailService } from './invoice-detail.service';
import { InvoicePaymentDetailsService } from './invoice-payment-details.service';
import { InvoiceEmailStatementDataDto } from '../dto/invoice-email-statement-response.dto';
import { InvoiceEmailTypeEnum } from '../enums/invoice-email-type.enum';
import { InvoiceType } from '../enums/invoice-type.enum';
import { Invoice } from '../entities/invoice.entity';
import { MailerService } from '../../shared/services/mailer.service';
import { SendInvoiceEmailRequestDto } from '../dto/send-invoice-email-request.dto';
import { LogRepository } from '../../log/repositories/log.repository';
import { LogObjectRepository } from '../../log/repositories/log-object.repository';
import { LogActivityRepository } from '../../log/repositories/log-activity.repository';
import { LogObjectType } from '../../log/enums/log-object-type.enum';
import { LogActivityType } from '../../log/enums/log-activity.enum';
import { getCurrentESTDate } from '../../utils/date-utils';

@Injectable()
export class InvoiceEmailStatementService {
  private readonly baseUrl = process.env.BASE_URL || '';

  constructor(
    private readonly invoiceEmailStatementRepository: InvoiceEmailStatementRepository,
    private readonly invoiceEmailStatementTransformationService: InvoiceEmailStatementTransformationService,
    private readonly invoiceDetailService: InvoiceDetailService,
    private readonly mailerService: MailerService,
    private readonly logRepository: LogRepository,
    private readonly logObjectRepository: LogObjectRepository,
    private readonly logActivityRepository: LogActivityRepository,
    private readonly invoicePaymentDetailsService: InvoicePaymentDetailsService,
  ) {}

  /**
   * Get invoice email statement data (GET — preview)
   */
  async getInvoiceEmailStatement(
    locationId: number,
    invoiceId: number,
  ): Promise<InvoiceEmailStatementDataDto> {
    try {
      // 1. Fetch invoice with user relation
      const invoice = await this.invoiceEmailStatementRepository.getInvoiceWithUser(
        invoiceId,
        locationId,
      );

      if (!invoice) {
        throw new NotFoundException('Invoice not found');
      }

      // 2. Determine email template type based on invoice type
      const emailTypeId = invoice.type === Invoice.TYPE_PRO_FORMA_INVOICE
        ? InvoiceEmailTypeEnum.PFI
        : InvoiceEmailTypeEnum.INVOICE;

      // 3. Fetch data in parallel
      const [lineItemsResponse, paymentsResponse, totalsResponse, emails, emailTemplate, hstNumber, lineItemsWithCode, reminderNotes] = await Promise.all([
        // Reuse existing service for line items
        this.invoiceDetailService.getInvoiceItems(locationId, '', invoiceId, false),
        // Reuse payment service for payments
        this.invoicePaymentDetailsService.getInvoicePayments(locationId, '', invoiceId),
        // Reuse existing service for totals
        this.invoiceDetailService.getInvoiceTotals(locationId, invoiceId),
        // Fetch customer emails
        invoice.user?.id ? this.invoiceEmailStatementRepository.getCustomerEmails(invoice.user.id) : Promise.resolve([]),
        // Fetch email template
        this.invoiceEmailStatementRepository.getEmailTemplate(emailTypeId),
        // Fetch HST number from invoice location
        this.invoiceEmailStatementRepository.getHstNumberFromInvoiceLocation(locationId),
        // Fetch line items with code field for email
        this.invoiceEmailStatementRepository.getLineItemsWithCode(invoiceId),
        // Fetch global reminder notes (policies)
        this.invoiceEmailStatementRepository.getReminderNotes(),
      ]);

      // 4. Extract data from responses
      const lineItems = lineItemsResponse.body?.lineItems || [];
      const payments = paymentsResponse.body || [];
      const totals = totalsResponse.body || {};

      // 5. Merge code field from lineItemsWithCode into lineItems
      const formattedLineItems = lineItems.map((item, index) => ({
        code: lineItemsWithCode[index]?.code || 'ITEM',
        description: item.description,
        qty: item.qty,
        price: item.price,
      }));

      // 6. Transform payments to simple format for email
      const formattedPayments = payments.map(payment => ({
        date: payment.date,
        type: payment.type,
        ref: payment.ref,
        amount: payment.amount, // Keep as string from API
      }));

      // 7. Transform totals to simple format (remove discounts, reorder fields)
      const formattedTotals = {
        subtotal: totals.subTotal,
        tax: totals.tax,
        total: totals.total,
        paid: totals.paid,
        balance: totals.balance,
      };

      // 8. Transform data to response format
      const result = this.invoiceEmailStatementTransformationService.transformToResponse(
        invoice,
        formattedLineItems,
        formattedPayments,
        formattedTotals,
        emails,
        emailTemplate,
        hstNumber,
        reminderNotes,
      );

      return result;
    } catch (error) {
      console.error('Error in getInvoiceEmailStatement service:', error);
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException(`Failed to retrieve invoice email statement: ${error.message}`);
    }
  }

  /**
   * Send invoice email (POST — send)
   *
   * PHP equivalent: EmailController::actionSend()
   * Flow: 1) Send email via SMTP  2) Mark invoice as sent  3) Create log entry
   */
  async sendInvoiceEmail(
    locationSlug:string,
    locationId: number,
    invoiceId: number,
    sendEmailDto: SendInvoiceEmailRequestDto,
    currentUserId: number,
  ): Promise<{ body: { invoiceId: number; isSent: boolean } }> {
    try {
      // 1. Fetch invoice with user + profile (for log message)
      const invoice = await this.invoiceEmailStatementRepository.getInvoiceWithUserProfile(invoiceId, locationId);
      if (!invoice) {
        throw new NotFoundException(`Invoice with id ${invoiceId} not found`);
      }

      // 2. Resolve email fields (use DTO values or fall back to defaults)
      const { to, subject, content } = await this.resolveEmailFields(sendEmailDto, locationId, invoiceId);

      // 3. Get location email for from/replyTo
      const location = await this.invoiceEmailStatementRepository.getLocation(locationId);
      if (!location) {
        throw new NotFoundException(`Location with id ${locationId} not found`);
      }


      // 4. Send email via SMTP
      await this.mailerService.sendEmail({
        from: location.email,
        replyTo: location.email,
        to,
        subject,
        html: content,
      });

      // 5. Mark invoice as sent
      await this.invoiceEmailStatementRepository.markInvoiceAsSent(invoiceId);

      // 6. Create log entry (replicates PHP InvoiceLog::invoiceMailed)
      await this.createMailedLog(locationSlug,invoice, locationId, currentUserId);

      return { body: { invoiceId, isSent: true } };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Failed to send invoice email: ${error.message}`);
    }
  }

  /**
   * Resolve email fields — use provided DTO values, or fall back to defaults from the preview data.
   */
  private async resolveEmailFields(
    dto: SendInvoiceEmailRequestDto,
    locationId: number,
    invoiceId: number,
  ): Promise<{ to: string[]; subject: string; content: string }> {
    const hasAllFields = dto.to && dto.to.length > 0 && dto.subject && dto.content;

    if (hasAllFields) {
      return { to: dto.to as string[], subject: dto.subject as string, content: dto.content as string };
    }

    // Fetch defaults from the email preview endpoint
    const previewData = await this.getInvoiceEmailStatement(locationId, invoiceId);
    const defaultTo = previewData.body.emailTemplate.to;

    const to = (dto.to && dto.to.length > 0) ? dto.to : (defaultTo ? [defaultTo] : []);
    const subject = dto.subject || previewData.body.emailTemplate.subject || 'Invoice from Arcadia Academy of Music';
    const content = dto.content || this.buildDefaultHtmlContent(previewData);

    if (to.length === 0) {
      throw new BadRequestException('At least one recipient email is required');
    }

    return { to, subject, content };
  }

  /**
   * Create the "invoiceMailed" log entry
   *
   * PHP equivalent: InvoiceLog::invoiceMailed($event)
   * Inserts into 3 tables: log, log_link (x2), log_history
   *
   * Note: PHP uses LogActivity::TYPE_CREATE (not TYPE_MAIL) for invoiceMailed events.
   * We replicate this exactly to maintain legacy parity.
   */
  private async createMailedLog(
    locationSlug:string,
    invoice: Invoice,
    locationId: number,
    currentUserId: number,
  ): Promise<void> {
    try {
      // Lookup log_object by name='invoice'
      const logObject = await this.logObjectRepository.findLogObjectByName(LogObjectType.INVOICE);

      // Lookup log_activity by name='create' (PHP uses TYPE_CREATE for mailed events)
      const logActivity = await this.logActivityRepository.findLogActivityByName(LogActivityType.TYPE_CREATE);

      if (!logObject || !logActivity) {
        console.error('Log object or activity not found for invoice mailed log');
        return;
      }

      // Get logged-in user's name for the message
      // PHP: $loggedUser->publicIdentity
      const loggedUser = await this.invoiceEmailStatementRepository.getUserWithProfile(currentUserId);
      const loggedUserName = loggedUser?.profile
        ? `${loggedUser.profile.firstname || ''} ${loggedUser.profile.lastname || ''}`.trim()
        : loggedUser?.username || 'Unknown';

      // Get customer name for the message
      // PHP: $invoiceModel->user->publicIdentity
      const customerName = invoice.user?.profile
        ? `${invoice.user.profile.firstname || ''} ${invoice.user.profile.lastname || ''}`.trim()
        : invoice.user?.username || 'Unknown';

      // Build invoice number string (e.g., "invoice #I-101390" or "invoice #P-101390")
      // PHP: 'invoice #' . $invoiceModel->getInvoiceNumber()
      const prefix = invoice.type === InvoiceType.PRO_FORMA_INVOICE ? 'P' : 'I';
      const invoiceNumber = `${prefix}-${String(invoice.invoiceNumber).padStart(5, '0')}`;
      const invoiceIndex = `invoice #${invoiceNumber}`;
      const userIndex = customerName;

      // Build log message with {{placeholder}} syntax
      // PHP: $loggedUser->publicIdentity . ' mailed an {{' . $invoiceIndex . '}} to {{' . $userIndex . '}}'
      const message = `${loggedUserName} mailed an {{${invoiceIndex}}} to {{${userIndex}}}`;

      // Serialize invoice data as JSON snapshot
      // PHP: Invoice::find()->andWhere(['id' => $invoiceModel->id])->asArray()->one()
      const invoiceData = JSON.stringify({
        id: invoice.id,
        transactionId: invoice.transactionId,
        user_id: invoice.userId,
        location_id: invoice.locationId,
        invoice_number: invoice.invoiceNumber,
        date: invoice.date,
        type: invoice.type,
        subTotal: invoice.subTotal,
        tax: invoice.tax,
        total: invoice.total,
        balance: invoice.balance,
        status: invoice.status,
        isSent: true,
      });

      // Log data (log table)
      const logData = {
        logObjectId: logObject.id,
        logActivityId: logActivity.id,
        message,
        data: invoiceData,
        locationId,
        createdOn: getCurrentESTDate(),
        createdUserId: currentUserId,
      };

      // First log_link (invoice link)
      // PHP path: "/admin/invoice/view?id=123"
      const invoiceLinkData = {
        index: invoiceIndex,
        baseUrl: this.baseUrl,
        path: `/v2/admin/invoices/${invoice.id}`,
      };

      // Log history
      const logHistoryData = {
        instanceId: invoice.id,
        instanceType: LogObjectType.INVOICE,
      };

      // Create log + first link + history using existing pattern
      // Same approach as LogStudentService.createStudentLog()
      const { log } = await this.logRepository.createLog(logData, invoiceLinkData, logHistoryData);

      // Create second log_link (customer link)
      // PHP creates 2 links per invoiceMailed log: invoice link + customer link
      await this.logRepository.createLogLink({
        logId: log.id,
        index: userIndex,
        baseUrl: this.baseUrl,
        path: `/v2/admin/${locationSlug}/customers/${invoice.userId}`,
      });
    } catch (error) {
      // Log error but don't fail the email send — the email was already sent successfully
      console.error('Error creating invoice mailed log:', error);
    }
  }

  /**
   * Build a proper HTML summary for the invoice email fallback
   */
  private buildDefaultHtmlContent(previewData: InvoiceEmailStatementDataDto): string {
    const { content, emailTemplate } = previewData.body;

    // 1. Items Table
    let itemsHtml = `
      <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-family: sans-serif;">
        <thead>
          <tr style="border-bottom: 2px solid #f0f0f0; text-align: left; color: #333;">
            <th style="padding: 12px 8px; font-size: 14px;">Code</th>
            <th style="padding: 12px 8px; font-size: 14px;">Description</th>
            <th style="padding: 12px 8px; font-size: 14px; text-align: center;">Qty</th>
            <th style="padding: 12px 8px; font-size: 14px; text-align: right;">Price</th>
          </tr>
        </thead>
        <tbody>
    `;

    content.lineItems.forEach((item) => {
      itemsHtml += `
        <tr style="border-bottom: 1px solid #f9f9f9;">
          <td style="padding: 10px 8px; font-size: 13px; color: #555;">${item.code || ''}</td>
          <td style="padding: 10px 8px; font-size: 13px; color: #555;">${item.description || ''}</td>
          <td style="padding: 10px 8px; font-size: 13px; color: #555; text-align: center;">${item.qty || 1}</td>
          <td style="padding: 10px 8px; font-size: 13px; color: #555; text-align: right;">${item.price || '$0.00'}</td>
        </tr>
      `;
    });

    itemsHtml += '</tbody></table>';

    // 2. Totals Table
    const totalsHtml = `
      <div style="margin-left: auto; width: 260px; font-family: sans-serif;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr><td style="padding: 4px 8px; font-size: 13px; color: #666;">SubTotal</td><td style="padding: 4px 8px; font-size: 13px; text-align: right;">${content.totals?.subtotal || ''}</td></tr>
          <tr><td style="padding: 4px 8px; font-size: 13px; color: #666;">Tax</td><td style="padding: 4px 8px; font-size: 13px; text-align: right;">${content.totals?.tax || ''}</td></tr>
          <tr style="font-weight: bold; font-size: 15px;">
            <td style="padding: 8px 8px; border-top: 1px solid #ddd;">Total</td>
            <td style="padding: 8px 8px; text-align: right; border-top: 1px solid #ddd;">${content.totals?.total || ''}</td>
          </tr>
          <tr><td style="padding: 4px 8px; font-size: 13px; color: #666;">Paid</td><td style="padding: 4px 8px; font-size: 13px; text-align: right; color: #007bff;">${content.totals?.paid || '$0.00'}</td></tr>
          <tr style="font-weight: bold; color: #d9534f; border-top: 2px double #eee;">
            <td style="padding: 8px 8px;">Balance</td>
            <td style="padding: 8px 8px; text-align: right;">${content.totals?.balance || ''}</td>
          </tr>
        </table>
      </div>
    `;

    // 3. Assemble Full Content
    return `
      <div style="max-width: 800px; margin: 0 auto; line-height: 1.5; color: #444;">
        ${emailTemplate.header || ''}
        ${itemsHtml}
        ${totalsHtml}
        ${content.hstNumber ? `<p style="font-size: 12px; color: #888; margin-top: 30px; border-top: 1px solid #eee; padding-top: 10px;"><strong>HST#</strong> ${content.hstNumber}</p>` : ''}
        <div style="margin-top: 20px;">
          ${emailTemplate.footer || ''}
        </div>
      </div>
    `;
  }
}
