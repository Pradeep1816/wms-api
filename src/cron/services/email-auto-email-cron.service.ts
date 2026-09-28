import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { formatDate } from '../../utils/date-utils';
import { MailerService } from '../../shared/services/mailer.service';
import {
  AutoEmailGroupOverdueRow,
  AutoEmailGroupStudentRow,
  AutoEmailLessonRow,
  AutoEmailTemplateRow,
  EmailAutoEmailCronRepository,
} from '../repositories/email-auto-email-cron.repository';
import { CronLockService } from './cron-lock.service';

const EMAIL_OBJECT_LESSON = 2;
const EMAIL_OBJECT_OVERDUE_LESSON = 9;

const MAKEUP_LESSON = 1;
const FIRST_SCHEDULE_LESSON = 2;
const OVERDUE_INVOICE = 3;
const FUTURE_LESSON = 4;

type TriggerSource = 'scheduler' | 'manual';

interface AutoEmailGroupSendPayload {
  lessonId: number;
  lessonDate: Date;
  courseName: string | null;
  teacherName: string | null;
  studentId: number;
  studentName: string | null;
  enrolmentId?: number;
  total?: number | null;
  balance?: number | null;
}

export interface EmailAutoEmailCronResult {
  jobName: string;
  triggeredBy: TriggerSource;
  triggeredByUserId: number | null;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  locationsProcessed: number;
  customersProcessed: number;
  notificationTypesProcessed: number;
  privateEmailsSent: number;
  groupEmailsSent: number;
  privateStatusUpdates: number;
  groupStatusUpdates: number;
  sendFailures: number;
  processingFailures: number;
  skippedNoRecipients: number;
}

@Injectable()
export class EmailAutoEmailCronService {
  private readonly logger = new Logger(EmailAutoEmailCronService.name);
  private readonly jobName = 'email-auto-email';
  private readonly cronExpression = '0 */5 * * * *';
  private readonly timeZone = 'America/New_York';

  constructor(
    private readonly repository: EmailAutoEmailCronRepository,
    private readonly mailerService: MailerService,
    private readonly cronLockService: CronLockService,
  ) {}

  @Cron('0 */5 * * * *', {
    name: 'email-auto-email',
    timeZone: 'America/New_York',
  })
  async runScheduled(): Promise<EmailAutoEmailCronResult | null> {
    return this.run('scheduler', null);
  }

  async runManually(
    triggeredByUserId: number,
  ): Promise<EmailAutoEmailCronResult | null> {
    return this.run('manual', triggeredByUserId);
  }

  getJobMetadata() {
    return {
      name: this.jobName,
      enabled: true,
      expression: this.cronExpression,
      timeZone: this.timeZone,
      manualTriggerAllowed: true,
      allowedRoles: ['administrator'],
    };
  }

  private async run(
    triggeredBy: TriggerSource,
    triggeredByUserId: number | null,
  ): Promise<EmailAutoEmailCronResult | null> {
    return this.cronLockService.runWithLock(
      `cron:${this.jobName}`,
      this.jobName,
      this.logger,
      () => this.executeRun(triggeredBy, triggeredByUserId),
    );
  }

  private async executeRun(
    triggeredBy: TriggerSource,
    triggeredByUserId: number | null,
  ): Promise<EmailAutoEmailCronResult | null> {
    const startedAtDate = new Date();

    this.logger.log(
      `[${this.jobName}] started via ${triggeredBy}${triggeredByUserId ? ` by user ${triggeredByUserId}` : ''}`,
    );

    const currentDate = this.getCurrentEasternStoredDate();
    const lessonDateTime = new Date(currentDate.getTime());
    lessonDateTime.setUTCDate(lessonDateTime.getUTCDate() + 1);

    const defaultTemplate =
      await this.repository.getEmailTemplateByType(EMAIL_OBJECT_LESSON);
    if (!defaultTemplate) {
      throw new Error(
        'Missing email_template for OBJECT_LESSON (emailTypeId=2)',
      );
    }

    const overdueTemplate =
      (await this.repository.getEmailTemplateByType(
        EMAIL_OBJECT_OVERDUE_LESSON,
      )) ?? defaultTemplate;

    const counts: Omit<
      EmailAutoEmailCronResult,
      | 'jobName'
      | 'triggeredBy'
      | 'triggeredByUserId'
      | 'startedAt'
      | 'completedAt'
      | 'durationMs'
    > = {
      locationsProcessed: 0,
      customersProcessed: 0,
      notificationTypesProcessed: 0,
      privateEmailsSent: 0,
      groupEmailsSent: 0,
      privateStatusUpdates: 0,
      groupStatusUpdates: 0,
      sendFailures: 0,
      processingFailures: 0,
      skippedNoRecipients: 0,
    };

    try {
      const [locations, customerIds] = await Promise.all([
        this.repository.getActiveLocations(),
        this.repository.getCheckedCustomerIds(),
      ]);

      for (const location of locations) {
        counts.locationsProcessed += 1;

        for (const customerId of customerIds) {
          counts.customersProcessed += 1;

          try {
            const [notificationTypes, recipientEmails] = await Promise.all([
              this.repository.getCheckedNotificationTypesForCustomer(
                customerId,
              ),
              this.repository.getRecipientEmails(customerId),
            ]);

            if (notificationTypes.length === 0) {
              continue;
            }

            if (recipientEmails.length === 0) {
              counts.skippedNoRecipients += notificationTypes.length;
              this.logger.warn(
                `[${this.jobName}] skipping customer ${customerId} at location ${location.id}; no recipient emails found`,
              );
              continue;
            }

            const [firstPrivateLessonIds, firstGroupLessonIds] =
              await Promise.all([
                this.repository.getPrivateFirstLessonIds(
                  customerId,
                  location.id,
                  currentDate,
                ),
                this.repository.getGroupFirstLessonIds(
                  customerId,
                  location.id,
                  currentDate,
                ),
              ]);

            for (const notificationType of notificationTypes) {
              counts.notificationTypesProcessed += 1;

              try {
                const template =
                  notificationType === OVERDUE_INVOICE
                    ? overdueTemplate
                    : defaultTemplate;
                const message = this.getMessage(notificationType);
                if (!message) {
                  continue;
                }

                const privateLessons =
                  await this.repository.getPrivateLessonsForNotification(
                    customerId,
                    location.id,
                    currentDate,
                    lessonDateTime,
                    notificationType,
                    firstPrivateLessonIds,
                  );

                if (privateLessons.length > 0) {
                  const privateHtml = this.renderPrivateEmailHtml(
                    privateLessons,
                    message,
                    notificationType,
                    template,
                  );

                  try {
                    await this.mailerService.sendEmail({
                      from: location.email || '',
                      replyTo: location.email || '',
                      to: recipientEmails,
                      subject:
                        template.subject || "Remainder for tommorrow's Lesson ",
                      html: privateHtml,
                    });

                    counts.privateEmailsSent += 1;
                    counts.privateStatusUpdates +=
                      await this.repository.markPrivateStatusesSent(
                        privateLessons.map((lesson) => lesson.lessonId),
                        notificationType,
                      );
                    await this.delay(5000);
                  } catch (error) {
                    counts.sendFailures += 1;
                    this.logger.error(
                      `[${this.jobName}] private email failed for customer ${customerId}, location ${location.id}, notificationType ${notificationType}: ${this.getErrorMessage(error)}`,
                    );
                  }
                }

                if (notificationType === OVERDUE_INVOICE) {
                  const groupLessons =
                    await this.repository.getUpcomingGroupLessonsBase(
                      customerId,
                      location.id,
                      currentDate,
                      lessonDateTime,
                    );

                  for (const groupLesson of groupLessons) {
                    const overdueRows =
                      await this.repository.getGroupOverdueRowsForLesson(
                        groupLesson.lessonId,
                        customerId,
                      );

                    for (const row of overdueRows) {
                      const payload: AutoEmailGroupSendPayload = {
                        lessonId: row.lessonId,
                        lessonDate: row.lessonDate,
                        courseName: row.courseName,
                        teacherName: row.teacherName,
                        studentId: row.studentId,
                        studentName: row.studentName,
                        enrolmentId: row.enrolmentId,
                        total: row.total,
                        balance: row.balance,
                      };

                      const html = this.renderGroupEmailHtml(
                        payload,
                        message,
                        notificationType,
                        template,
                      );

                      try {
                        await this.mailerService.sendEmail({
                          from: location.email || '',
                          replyTo: location.email || '',
                          to: recipientEmails,
                          subject:
                            template.subject ||
                            "Remainder for tommorrow's Lesson ",
                          html,
                        });
                        counts.groupEmailsSent += 1;
                        counts.groupStatusUpdates +=
                          await this.repository.markGroupStatusSent(
                            row.lessonId,
                            row.studentId,
                            notificationType,
                          );
                      } catch (error) {
                        counts.sendFailures += 1;
                        this.logger.error(
                          `[${this.jobName}] group overdue email failed for lesson ${row.lessonId}, student ${row.studentId}: ${this.getErrorMessage(error)}`,
                        );
                      }

                      await this.delay(5000);
                    }
                  }

                  continue;
                }

                const groupLessons =
                  await this.repository.getGroupLessonsForNotification(
                    customerId,
                    location.id,
                    currentDate,
                    lessonDateTime,
                    notificationType,
                    firstGroupLessonIds,
                  );

                if (groupLessons.length === 0) {
                  continue;
                }

                for (const lesson of groupLessons) {
                  const students =
                    await this.repository.getPendingGroupStudentsForLesson(
                      customerId,
                      lesson.courseId,
                      lesson.lessonId,
                      notificationType,
                      currentDate,
                    );

                  for (const student of students) {
                    const html = this.renderGroupEmailHtml(
                      {
                        lessonId: lesson.lessonId,
                        lessonDate: lesson.lessonDate,
                        courseName: lesson.courseName,
                        teacherName: lesson.teacherName,
                        studentId: student.studentId,
                        studentName: student.studentName,
                      },
                      message,
                      notificationType,
                      template,
                    );

                    try {
                      await this.mailerService.sendEmail({
                        from: location.email || '',
                        replyTo: location.email || '',
                        to: recipientEmails,
                        subject:
                          template.subject ||
                          "Remainder for tommorrow's Lesson ",
                        html,
                      });
                      counts.groupEmailsSent += 1;
                      counts.groupStatusUpdates +=
                        await this.repository.markGroupStatusSent(
                          lesson.lessonId,
                          student.studentId,
                          notificationType,
                        );
                    } catch (error) {
                      counts.sendFailures += 1;
                      this.logger.error(
                        `[${this.jobName}] group email failed for lesson ${lesson.lessonId}, student ${student.studentId}: ${this.getErrorMessage(error)}`,
                      );
                    }
                  }
                }

                await this.delay(5000);
              } catch (error) {
                counts.processingFailures += 1;
                this.logger.error(
                  `[${this.jobName}] failed to process customer ${customerId}, location ${location.id}, notificationType ${notificationType}: ${this.getErrorMessage(error)}`,
                );
                continue;
              }
            }
          } catch (error) {
            counts.processingFailures += 1;
            this.logger.error(
              `[${this.jobName}] failed to process customer ${customerId} at location ${location.id}: ${this.getErrorMessage(error)}`,
            );
            continue;
          }
        }
      }

      const completedAtDate = new Date();
      const result: EmailAutoEmailCronResult = {
        jobName: this.jobName,
        triggeredBy,
        triggeredByUserId,
        startedAt: startedAtDate.toISOString(),
        completedAt: completedAtDate.toISOString(),
        durationMs: completedAtDate.getTime() - startedAtDate.getTime(),
        ...counts,
      };

      this.logger.log(
        `[${this.jobName}] completed in ${result.durationMs}ms. PrivateEmails=${result.privateEmailsSent}, GroupEmails=${result.groupEmailsSent}, PrivateStatusUpdates=${result.privateStatusUpdates}, GroupStatusUpdates=${result.groupStatusUpdates}, SendFailures=${result.sendFailures}, ProcessingFailures=${result.processingFailures}`,
      );

      return result;
    } catch (error) {
      this.logger.error(
        `[${this.jobName}] failed`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  private getMessage(type: number): string | null {
    switch (type) {
      case MAKEUP_LESSON:
        return 'Makeup Lesson';
      case FIRST_SCHEDULE_LESSON:
        return 'First Scheduled Lesson';
      case OVERDUE_INVOICE:
        return 'Overdue Invoice';
      case FUTURE_LESSON:
        return 'Future Lesson';
      default:
        return null;
    }
  }

  private renderPrivateEmailHtml(
    lessons: AutoEmailLessonRow[],
    message: string,
    type: number,
    template: AutoEmailTemplateRow,
  ): string {
    const blocks = lessons
      .map((lesson) => {
        const greetingName = lesson.studentName || 'Customer';
        const amountCells =
          type === OVERDUE_INVOICE
            ? `
              <th>Amount</th>
              <th>Balance</th>
            `
            : '';

        const amountValues =
          type === OVERDUE_INVOICE
            ? `
              <td align="center" valign="top" bgcolor="#ffffff">${this.escapeHtml(this.formatCurrency(lesson.privateTotal))}</td>
              <td align="center" valign="top" bgcolor="#ffffff">${this.escapeHtml(this.formatCurrency(lesson.privateBalance))}</td>
            `
            : '';

        return `
          ${template.header || ''}
          <h3>${this.escapeHtml(`Hello ${greetingName} please check the following ${message} details.`)}</h3>
          <table width="100%" cellspacing="0" cellpadding="0" border="1">
            <thead>
              <tr>
                <th>Lesson Date</th>
                <th>Student Name</th>
                <th>Course Name</th>
                <th>Teacher Name</th>
                ${amountCells}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td align="center" valign="top" bgcolor="#ffffff">${this.escapeHtml(this.formatLessonDateTime(lesson.lessonDate))}</td>
                <td align="center" valign="top" bgcolor="#ffffff">${this.escapeHtml(lesson.studentName || '')}</td>
                <td align="center" valign="top" bgcolor="#ffffff">${this.escapeHtml(lesson.courseName || '')}</td>
                <td align="center" valign="top" bgcolor="#ffffff">${this.escapeHtml(lesson.teacherName || '')}</td>
                ${amountValues}
              </tr>
            </tbody>
          </table>
        `;
      })
      .join('');

    return this.wrapHtml(`${blocks}${template.footer || ''}`);
  }

  private renderGroupEmailHtml(
    payload: AutoEmailGroupSendPayload,
    message: string,
    type: number,
    template: AutoEmailTemplateRow,
  ): string {
    const amountCells =
      type === OVERDUE_INVOICE
        ? `
          <th>Amount</th>
          <th>Balance</th>
        `
        : '';

    const amountValues =
      type === OVERDUE_INVOICE
        ? `
          <td align="center" valign="top" bgcolor="#ffffff">${this.escapeHtml(this.formatCurrency(payload.total ?? null))}</td>
          <td align="center" valign="top" bgcolor="#ffffff">${this.escapeHtml(this.formatCurrency(payload.balance ?? null))}</td>
        `
        : '';

    const greetingName = payload.studentName || 'Customer';

    return this.wrapHtml(`
      ${template.header || ''}
      <h3>${this.escapeHtml(`Hello ${greetingName} please check the following ${message} details.`)}</h3>
      <table width="100%" cellspacing="0" cellpadding="0" border="1">
        <thead>
          <tr>
            <th>Lesson Date</th>
            <th>Student Name</th>
            <th>Course Name</th>
            <th>Teacher Name</th>
            ${amountCells}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td align="center" valign="top" bgcolor="#ffffff">${this.escapeHtml(this.formatLessonDateTime(payload.lessonDate))}</td>
            <td align="center" valign="top" bgcolor="#ffffff">${this.escapeHtml(payload.studentName || '')}</td>
            <td align="center" valign="top" bgcolor="#ffffff">${this.escapeHtml(payload.courseName || '')}</td>
            <td align="center" valign="top" bgcolor="#ffffff">${this.escapeHtml(payload.teacherName || '')}</td>
            ${amountValues}
          </tr>
        </tbody>
      </table>
      ${template.footer || ''}
    `);
  }

  private wrapHtml(body: string): string {
    return `<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <title>SMW Arcadia Musical School</title>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0 " />
  <meta name="format-detection" content="telephone=no"/>
</head>
<body>${body}</body>
</html>`;
  }

  private formatLessonDateTime(date: Date): string {
    const time = new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(new Date(date));

    return `${formatDate(new Date(date))} @ ${time}`;
  }

  private formatCurrency(value: number | null): string {
    const amount = Number(value ?? 0);
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  }

  private getCurrentEasternStoredDate(): Date {
    const formatter = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    const parts = formatter.formatToParts(new Date());
    const map = new Map(parts.map((part) => [part.type, part.value]));
    const text = `${map.get('year')}-${map.get('month')}-${map.get('day')} ${map.get('hour')}:${map.get('minute')}:${map.get('second')}`;
    return new Date(`${text}Z`);
  }

  private async delay(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }
}
