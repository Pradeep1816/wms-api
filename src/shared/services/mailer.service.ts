import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

export interface SendEmailOptions {
  from: string;
  replyTo?: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  html: string;
  messageId?: string;
}

export interface SendBulkEmailOptions {
  from: string;
  replyTo?: string;
  to: string[];
  subject: string;
  html: string;
  concurrency?: number;
}

export interface BulkEmailSendResult {
  totalRecipients: number;
  sentRecipients: number;
  failedRecipients: number;
  batchCount: number;
  successfulBatchCount: number;
  failedBatches: Array<{
    recipients: string[];
    error: string;
  }>;
}

/**
 * Shared SMTP email sender service
 *
 * PHP equivalent: Yii::$app->mailer (yii\swiftmailer\Mailer with Swift_SmtpTransport)
 * Uses config.smtp from configuration.ts (MAIL_* env vars).
 */
@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private readonly transporter: nodemailer.Transporter;
  private readonly maxRecipientsPerMessage: number;
  private readonly bulkConcurrency: number;

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('smtp.host');
    const port = this.configService.get<number>('smtp.port') ?? 587;
    const user = this.configService.get<string>('smtp.username');
    const pass = this.configService.get<string>('smtp.password');
    this.maxRecipientsPerMessage = Math.max(
      1,
      this.configService.get<number>('smtp.maxRecipientsPerMessage') ?? 45,
    );
    this.bulkConcurrency = Math.max(
      1,
      this.configService.get<number>('smtp.bulkConcurrency') ?? 10,
    );
    // Optional: 'ssl' for port 465; omit for 587 (STARTTLS, e.g. AWS SES)
    const encryption = this.configService.get<string>('smtp.encryption');

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: encryption === 'ssl' || port === 465,
      auth: {
        user,
        pass,
      },
      tls: {
        rejectUnauthorized: false, // Matches PHP: verify_peer => false, verify_peer_name => false
      },
    });

    this.logger.log('✅ Mailer service initialized');
  }

  /**
   * Send email via SMTP
   *
   * PHP equivalent:
   *   Yii::$app->mailer->compose('content', ['content' => $model->content])
   *     ->setFrom($location->email)
   *     ->setReplyTo($location->email)
   *     ->setSubject($model->subject)
   *   Yii::$app->mailer->sendMultiple($content);
   */
  async sendEmail(options: SendEmailOptions): Promise<void> {
    const { from, replyTo, to, cc, bcc, subject, html } = options;

    try {
      const info = await this.transporter.sendMail({
        from,
        replyTo: replyTo || from,
        to: to.join(', '),
        cc: cc?.length ? cc.join(', ') : undefined,
        bcc: bcc?.length ? bcc.join(', ') : undefined,
        subject,
        html,
        messageId: options.messageId,
      });

      this.logger.log(`Email sent successfully: ${info.messageId}`);
    } catch (error) {
      this.logger.error(`Failed to send email: ${error.message}`, error.stack);
      throw new Error(`Failed to send email: ${error.message}`, { cause: error });
    }
  }

  async sendBulkEmail(options: SendBulkEmailOptions): Promise<BulkEmailSendResult> {
    const { from, replyTo, subject, html } = options;
    const recipients = this.normalizeRecipients(options.to);

    if (!recipients.length) {
      throw new Error('Failed to send email: No valid recipient emails found');
    }

    const concurrency = Math.max(
      1,
      Math.min(options.concurrency ?? this.bulkConcurrency, this.maxRecipientsPerMessage),
    );
    const batches = this.chunkRecipients(recipients, concurrency);
    const failedBatches: BulkEmailSendResult['failedBatches'] = [];
    let successfulBatchCount = 0;
    let sentRecipients = 0;

    for (const batch of batches) {
      const batchResults = await Promise.allSettled(
        batch.map(async (recipient) => {
          const info = await this.transporter.sendMail({
            from,
            replyTo: replyTo || from,
            to: recipient,
            subject,
            html,
          });

          this.logger.log(`Bulk email sent successfully: ${info.messageId} (${recipient})`);
          return recipient;
        }),
      );

      const failedRecipients = batchResults.flatMap((result, index) => {
        if (result.status === 'fulfilled') {
          return [];
        }

        const reason = result.reason instanceof Error ? result.reason.message : 'Unknown bulk email error';
        return [{ recipient: batch[index], error: reason }];
      });

      sentRecipients += batch.length - failedRecipients.length;

      if (failedRecipients.length === 0) {
        successfulBatchCount += 1;
        continue;
      }

      failedBatches.push({
        recipients: failedRecipients.map(({ recipient }) => recipient),
        error: failedRecipients.map(({ recipient, error }) => `${recipient}: ${error}`).join('; '),
      });
      this.logger.error(
        `Failed to send ${failedRecipients.length} recipient(s) in bulk email wave`,
      );
    }

    return {
      totalRecipients: recipients.length,
      sentRecipients,
      failedRecipients: recipients.length - sentRecipients,
      batchCount: batches.length,
      successfulBatchCount,
      failedBatches,
    };
  }

  private normalizeRecipients(recipients: string[]): string[] {
    return Array.from(
      new Set(
        recipients
          .map((recipient) => recipient?.trim().toLowerCase())
          .filter((recipient): recipient is string => Boolean(recipient)),
      ),
    );
  }

  private chunkRecipients(recipients: string[], batchSize: number): string[][] {
    const batches: string[][] = [];

    for (let index = 0; index < recipients.length; index += batchSize) {
      batches.push(recipients.slice(index, index + batchSize));
    }

    return batches;
  }
}
