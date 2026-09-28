import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InvoiceEmailStatementService } from '../../invoice/services/invoice-email-statement.service';
import { InvoicePaymentEmailService } from '../../invoice/services/invoice-payment-email.service';
import { Lesson } from '../../lesson/entities/lesson.entity';
import { LocationRepository } from '../../location/repositories/location.repository';
import { LogActivityType } from '../../log/enums/log-activity.enum';
import { LogObjectType } from '../../log/enums/log-object-type.enum';
import { LogActivityRepository } from '../../log/repositories/log-activity.repository';
import { LogObjectRepository } from '../../log/repositories/log-object.repository';
import { LogRepository } from '../../log/repositories/log.repository';
import { Payment } from '../../payment/entities/payment.entity';
import { MailerService } from '../../shared/services/mailer.service';
import { getCurrentESTDate } from '../../utils/date-utils';
import { User } from '../../user/entities/user.entity';
import { SendEmailRequestDto } from '../dto/send-email-request.dto';
import { EmailSendObjectTypeEnum } from '../enums/send-email-object-type.enum';
import { Repository } from 'typeorm';

type GenericSendResponse = {
  body: {
    isSent: boolean;
    objectId: number | null;
    invoiceId: number | null;
    paymentId: number | null;
  };
};

@Injectable()
export class EmailSendService {
  private readonly baseUrl = process.env.BASE_URL || '';

  constructor(
    private readonly invoiceEmailStatementService: InvoiceEmailStatementService,
    private readonly invoicePaymentEmailService: InvoicePaymentEmailService,
    private readonly locationRepository: LocationRepository,
    private readonly mailerService: MailerService,
    private readonly logRepository: LogRepository,
    private readonly logObjectRepository: LogObjectRepository,
    private readonly logActivityRepository: LogActivityRepository,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Lesson)
    private readonly lessonRepository: Repository<Lesson>,
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
  ) {}

  async sendEmail(
    locationSlug: string,
    locationId: number,
    dto: SendEmailRequestDto,
    currentUserId: number,
  ): Promise<GenericSendResponse | { body: { invoiceId: number; isSent: boolean } } | { body: { paymentId: number; isSent: boolean } }> {
    const to = this.normalizeRecipients(dto.to);
    const bcc = this.normalizeRecipients(dto.bcc ?? []);
    const invoiceId = dto.invoiceId ?? dto.paymentRequestId;

    if (!to.length) {
      throw new BadRequestException('At least one recipient email is required');
    }

    // If objectId is provided, it must be either INVOICE or PAYMENT for now (based on current use cases). --- IGNORE ---
    if (dto.objectId === EmailSendObjectTypeEnum.INVOICE || dto.objectId === EmailSendObjectTypeEnum.PFI) {
      if (!invoiceId) {
        throw new BadRequestException('invoiceId or paymentRequestId is required for invoice email');
      }

      console.log(
        `[EmailSendService] objectId=${dto.objectId} ('${dto.objectId}') -> InvoiceEmailStatementService.sendInvoiceEmail(invoiceId=${invoiceId})`,
      );

      return this.invoiceEmailStatementService.sendInvoiceEmail(
        locationSlug,
        locationId,
        invoiceId,
        {
          to,
          subject: dto.subject,
          content: dto.content,
        },
        currentUserId,
      );
    }

    // If objectId is PAYMENT, paymentId is required and it will use InvoicePaymentEmailService to send email.
    if (dto.objectId === EmailSendObjectTypeEnum.PAYMENT) {
      if (!dto.paymentId) {
        throw new BadRequestException('paymentId is required for payment email');
      }

      console.log(
        `[EmailSendService] objectId=${dto.objectId} ('${dto.objectId}') -> InvoicePaymentEmailService.sendPaymentEmail(paymentId=${dto.paymentId})`,
      );

      return this.invoicePaymentEmailService.sendPaymentEmail(
        locationSlug,
        dto.paymentId,
        locationId,
        {
          to,
          subject: dto.subject,
          content: dto.content,
        },
        currentUserId,
      );
    }

    // Fallback logic for invoiceId or paymentId when objectId is not provided. This is to support legacy EmailController::actionSend() calls where objectId was not sent but invoiceId or paymentRequestId was sent in the payload.
    if (invoiceId) {
      console.log(
        `[EmailSendService] fallback by invoiceId -> InvoiceEmailStatementService.sendInvoiceEmail(invoiceId=${invoiceId})`,
      );

      return this.invoiceEmailStatementService.sendInvoiceEmail(
        locationSlug,
        locationId,
        invoiceId,
        {
          to,
          subject: dto.subject,
          content: dto.content,
        },
        currentUserId,
      );
    }

    // If paymentId is provided without objectId, 
    // we will also fallback to InvoicePaymentEmailService to send email. 
    // This is to support legacy EmailController::actionSend() calls where objectId was not sent but paymentId was sent in the payload.
    
    if (dto.paymentId) {
      console.log(
        `[EmailSendService] fallback by paymentId -> InvoicePaymentEmailService.sendPaymentEmail(paymentId=${dto.paymentId})`,
      );

      return this.invoicePaymentEmailService.sendPaymentEmail(
        locationSlug,
        dto.paymentId,
        locationId,
        {
          to,
          subject: dto.subject,
          content: dto.content,
        },
        currentUserId,
      );
    }

    // it means the payload is missing required identifiers to determine the email sending logic, so we return bad request error.
    const location = await this.locationRepository.getLocationDetails(locationId);
    if (!location || !location.email) {
      throw new NotFoundException(`Location email not found for location ${locationId}`);
    }

    console.log(
      `[EmailSendService] objectId=${dto.objectId ?? 'N/A'} ('${dto.objectId ?? 'N/A'}') -> MailerService.sendEmail(direct SMTP)`,
    );

    await this.mailerService.sendEmail({
      from: location.email,
      replyTo: location.email,
      to,
      bcc,
      subject: dto.subject,
      html: dto.content,
    });

    await this.createMailAuditLog(locationSlug,locationId, dto, currentUserId);
    
    return {
      body: {
        isSent: true,
        objectId: dto.objectId ?? null,
        invoiceId: invoiceId ?? null,
        paymentId: dto.paymentId ?? null,
      },
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

  private async createMailAuditLog(
    locationSlug: string,
    locationId: number,
    dto: SendEmailRequestDto,
    currentUserId: number,
  ): Promise<void> {
    try {
      switch (dto.objectId) {
        case EmailSendObjectTypeEnum.CUSTOMER_STATEMENT:
          if (dto.userId) {
            await this.createCustomerStatementMailLog(locationSlug, locationId, dto.userId, currentUserId);
          }
          return;
        case EmailSendObjectTypeEnum.LESSON:
          if (dto.lessonId) {
            await this.createLessonMailLog(locationSlug,locationId, dto.lessonId, currentUserId, false);
          }
          return;
        case EmailSendObjectTypeEnum.OVERDUE_LESSON:
          if (dto.lessonId) {
            await this.createLessonMailLog(locationSlug,locationId, dto.lessonId, currentUserId, true);
          }
          return;
        case EmailSendObjectTypeEnum.RECEIPT:
          if (dto.userId) {
            await this.createReceiptMailLog(locationSlug, locationId, dto.userId, currentUserId);
          }
          return;
        default:
          return;
      }
    } catch (error) {
      console.error('Error creating direct mail audit log:', error);
    }
  }

  private async createCustomerStatementMailLog(
    locationSlug: string,
    locationId: number,
    customerUserId: number,
    currentUserId: number,
  ): Promise<void> {
    const [loggedUser, customer, logObject, logActivity] = await Promise.all([
      this.findUserWithProfile(currentUserId),
      this.findUserWithProfile(customerUserId),
      this.logObjectRepository.findLogObjectByName(LogObjectType.USER),
      this.logActivityRepository.findLogActivityByName(LogActivityType.TYPE_MAIL),
    ]);

    if (!customer || !logObject || !logActivity) {
      console.error('Unable to create customer statement mail log');
      return;
    }

    const loggedUserName = this.getDisplayName(loggedUser);
    const customerName = this.getDisplayName(customer);
    const message = `${loggedUserName} mailed customer statement for {{${customerName}}}`;

    const logData = JSON.stringify({
      id: customer.id,
      username: customer.username,
      profile: customer.profile
        ? {
            firstname: customer.profile.firstname,
            lastname: customer.profile.lastname,
          }
        : null,
    });

    const { log } = await this.logRepository.createLog(
      {
        logObjectId: logObject.id,
        logActivityId: logActivity.id,
        message,
        data: logData,
        locationId,
        createdOn: getCurrentESTDate(),
        createdUserId: currentUserId,
      },
      {
        index: customerName,
        baseUrl: this.baseUrl,
        path: `/v2/admin/${locationSlug}/customers/${customer.id}`,
      },
      {
        instanceId: customer.id,
        instanceType: LogObjectType.USER,
      },
    );
  }

  private async createLessonMailLog(
    locationSlug,
    locationId: number,
    lessonId: number,
    currentUserId: number,
    isOverdue: boolean,
  ): Promise<void> {
    const [loggedUser, lesson, logObject, logActivity] = await Promise.all([
      this.findUserWithProfile(currentUserId),
      this.findLessonWithCourse(lessonId, locationId),
      this.logObjectRepository.findLogObjectByName(LogObjectType.LESSON),
      this.logActivityRepository.findLogActivityByName(LogActivityType.TYPE_MAIL),
    ]);

    if (!lesson || !logObject || !logActivity) {
      console.error('Unable to create lesson mail log');
      return;
    }

    const loggedUserName = this.getDisplayName(loggedUser);
    const message = isOverdue
      ? `${loggedUserName} mailed overdue lesson details`
      : `${loggedUserName} mailed this lesson details`;
    const lessonIndex = `lesson (ID: ${lesson.id})`;

    const logData = JSON.stringify({
      id: lesson.id,
      courseId: lesson.courseId,
      teacherId: lesson.teacherId,
      date: lesson.date,
      duration: lesson.duration,
      status: lesson.status,
      isPresent: lesson.isPresent,
      isConfirmed: lesson.isConfirmed,
      type: lesson.type,
    });

    await this.logRepository.createLog(
      {
        logObjectId: logObject.id,
        logActivityId: logActivity.id,
        message,
        data: logData,
        locationId,
        createdOn: getCurrentESTDate(),
        createdUserId: currentUserId,
      },
      {
        index: lessonIndex,
        baseUrl: this.baseUrl,
        path: `/v2/admin/${locationSlug}lessons/${lesson.id}`,
      },
      {
        instanceId: lesson.id,
        instanceType: LogObjectType.LESSON,
      },
    );
  }

  private async createReceiptMailLog(
    locationSlug:string,
    locationId: number,
    customerUserId: number,
    currentUserId: number,
  ): Promise<void> {
    console.log('test',locationId,customerUserId,currentUserId)
    const [loggedUser, customer, logObject, logActivity] = await Promise.all([
      this.findUserWithProfile(currentUserId),
      this.findUserWithProfileAndLocation(customerUserId),
      this.logObjectRepository.findLogObjectByName(LogObjectType.PAYMENT),
      this.logActivityRepository.findLogActivityByName(LogActivityType.TYPE_CREATE),
    ]);

    if (!customer || !customer.userLocation || customer.userLocation.locationId !== locationId || !logObject || !logActivity) {
      console.error('Unable to create receipt mail log');
      return;
    }

    const loggedUserName = this.getDisplayName(loggedUser);
    const customerName = this.getDisplayName(customer);
    const message = `${loggedUserName} mailed a transaction details  to {{${customerName}}}`;

    const logData = JSON.stringify({
      id: customer.id,
      username: customer.username,
      profile: customer.profile
        ? {
            firstname: customer.profile.firstname,
            lastname: customer.profile.lastname,
          }
        : null,
    });

    const { log } = await this.logRepository.createLog(
      {
        logObjectId: logObject.id,
        logActivityId: logActivity.id,
        message,
        data: logData,
        locationId,
        createdOn: getCurrentESTDate(),
        createdUserId: currentUserId,
      },
      {
        index: customerName,
        baseUrl: this.baseUrl,
        path: `/v2/admin/${locationSlug}/customers/${customer.id}`,
      },
      {
        instanceId: customer.id,
        instanceType: LogObjectType.PAYMENT,
      },
    );

    await this.logRepository.createLogHistory({
      logId: log.id,
      instanceId: customer.id,
      instanceType: LogObjectType.USER,
    });
  }

  private async findUserWithProfile(userId: number): Promise<User | null> {
    return this.userRepository.findOne({
      where: { id: userId },
      relations: ['profile'],
    });
  }

  private async findUserWithProfileAndLocation(userId: number): Promise<User | null> {
    return this.userRepository.findOne({
      where: { id: userId },
      relations: ['profile', 'userLocation'],
    });
  }

  private async findLessonWithCourse(lessonId: number, locationId: number): Promise<Lesson | null> {
    const lesson = await this.lessonRepository.findOne({
      where: { id: lessonId, isDeleted: false },
      relations: ['course', 'course.program'],
    });

    if (!lesson || lesson.course?.locationId !== locationId) {
      return null;
    }

    return lesson;
  }

  private async findPaymentWithUser(paymentId: number, locationId: number): Promise<Payment | null> {
    const payment = await this.paymentRepository.findOne({
      where: { id: paymentId, isDeleted: 0 },
      relations: ['user', 'user.profile', 'user.userLocation', 'paymentMethod'],
    });

    if (!payment || payment.user?.userLocation?.locationId !== locationId) {
      return null;
    }

    return payment;
  }

  private getDisplayName(
    entity: { username?: string | null; profile?: { firstname?: string | null; lastname?: string | null } | null } | null,
  ): string {
    if (!entity) {
      return 'Unknown';
    }

    const firstName = entity.profile?.firstname?.trim() || '';
    const lastName = entity.profile?.lastname?.trim() || '';
    const fullName = `${firstName} ${lastName}`.trim();

    return fullName || entity.username || 'Unknown';
  }
}
