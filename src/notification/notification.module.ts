import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailTemplate } from './entities/email-template.entity';
import { EmailObject } from './entities/email-object.entity';
import { EmailTemplateController } from './controllers/email.controller';
import { EmailTemplateService } from './services/email.service';
import { EmailTemplateRepository } from './repositories/email.repository';
import { EmailTransformationService } from './services/transformations/email-transformation.service';
import { AuthModule } from 'src/auth/auth.module';
import { TestEmail } from './entities/test-email.entity';
import { TestEmailController } from './controllers/test-email.controller';
import { TestEmailTransformationService } from './services/transformations/test-email-transformation.service';
import { TestEmailRepository } from './repositories/test-email.repository';
import { TestEmailService } from './services/test-email.service';
import { ReminderNote } from './entities/reminder-note.entity';
import { ReminderNoteService } from './services/reminder-note.service';
import { ReminderNoteTransformationService } from './services/transformations/reminder-note-transformation.service';
import { ReminderNoteRepository } from './repositories/reminder-note.repository';
import { ReminderNoteController } from './controllers/reminder-note.controller';
import { EmailSendController } from './controllers/send-email.controller';
import { EmailSendService } from './services/send-email.service';
import { MailerService } from '../shared/services/mailer.service';
import { LocationModule } from '../location/location.module';
import { InvoiceModule } from '../invoice/invoice.module';
import { LogModule } from '../log/log.module';
import { User } from '../user/entities/user.entity';
import { Lesson } from '../lesson/entities/lesson.entity';
import { Payment } from '../payment/entities/payment.entity';


@Module({
  imports: [
    TypeOrmModule.forFeature([EmailTemplate, EmailObject, TestEmail, ReminderNote, User, Lesson, Payment]),
    AuthModule,
    LocationModule,
    InvoiceModule,
    LogModule,
  ],
  controllers: [EmailTemplateController,TestEmailController,ReminderNoteController, EmailSendController],
  providers: [
    EmailTemplateService,
    EmailTemplateRepository,
    EmailTransformationService,
    TestEmailService,
    TestEmailRepository,
    TestEmailTransformationService,
    ReminderNoteRepository,
    ReminderNoteTransformationService,
    ReminderNoteService,
    EmailSendService,
    MailerService,
  

  ],
  exports: [
    EmailTemplateService,
    EmailTemplateRepository,
    TestEmailService,
    TestEmailRepository,
    ReminderNoteService,
    ReminderNoteRepository,
  ],
})
export class NotificationModule {}
