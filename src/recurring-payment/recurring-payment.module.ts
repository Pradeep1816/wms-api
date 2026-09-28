import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomerRecurringPayment } from './entities/customer-recurring-payment.entity';
import { CustomerRecurringPaymentEnrolment } from './entities/customer-recurring-payment-enrolment.entity';
import { PaymentFrequency } from '../payment/entities/payment-frequency.entity';
import { PaymentMethod } from '../payment/entities/payment-method.entity';
import { CustomerRecurringPaymentRepository } from './repositories/customer-recurring-payment.repository';
import { RecurringPaymentUpdateRepository } from './repositories/recurring-payment-update.repository';
import { CreateRecurringPaymentRepository } from './repositories/create-recurring-payment.repository';
import { RecurringPaymentsRepository } from './repositories/recurring-payments.repository';
import { DeleteRecurringPaymentRepository } from './repositories/delete-recurring-payment.repository';
import { CustomerRecurringPaymentService } from './services/customer-recurring-payment.service';
import { RecurringPaymentUpdateService } from './services/recurring-payment-update.service';
import { CreateRecurringPaymentService } from './services/create-recurring-payment.service';
import { RecurringPaymentsService } from './services/recurring-payments.service';
import { DeleteRecurringPaymentService } from './services/delete-recurring-payment.service';
import { CustomerRecurringPaymentTransformationService } from './services/customer-recurring-payment-transformation.service';
import { RecurringPaymentsListTransformationService } from './services/recurring-payments-list-transformation.service';
import { CustomerRecurringPaymentInfoTransformationService } from './services/customer-recurring-payment-info-transformation.service';
import { RecurringPaymentUpdateTransformationService } from './services/transformations/recurring-payment-update-transformation.service';
import { CustomerRecurringPaymentCalculationService } from './services/customer-recurring-payment-calculation.service';
import { RecurringPaymentController } from './controllers/recurring-payment.controller';
import { RecurringPaymentUpdateController } from './controllers/recurring-payment-update.controller';
import { CreateRecurringPaymentController } from './controllers/create-recurring-payment.controller';
import { DeleteRecurringPaymentController } from './controllers/delete-recurring-payment.controller';
import { CustomerValidationModule } from '../shared/customer-validation.module';
import { SharedModule } from '../shared/shared.module';
import { EnrolmentModule } from '../enrolment/enrolment.module';
import { AuthModule } from '../auth/auth.module';
import { LogModule } from '../log/log.module';
import { Enrolment } from '../enrolment/entities/enrolment.entity';
import { User } from '../user/entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CustomerRecurringPayment,
      CustomerRecurringPaymentEnrolment,
      PaymentFrequency,
      PaymentMethod,
      Enrolment,
      User,
    ]),
    CustomerValidationModule,
    SharedModule,
    EnrolmentModule,
    AuthModule,
    LogModule,
  ],
  controllers: [
    RecurringPaymentController,
    CreateRecurringPaymentController,
    RecurringPaymentUpdateController,
    DeleteRecurringPaymentController,
  ],
  providers: [
    CustomerRecurringPaymentRepository,
    CreateRecurringPaymentRepository,
    RecurringPaymentUpdateRepository,
    RecurringPaymentsRepository,
    DeleteRecurringPaymentRepository,
    CustomerRecurringPaymentService,
    CreateRecurringPaymentService,
    RecurringPaymentUpdateService,
    RecurringPaymentsService,
    DeleteRecurringPaymentService,
    CustomerRecurringPaymentTransformationService,
    RecurringPaymentsListTransformationService,
    CustomerRecurringPaymentInfoTransformationService,
    RecurringPaymentUpdateTransformationService,
    CustomerRecurringPaymentCalculationService,
  ],
  exports: [
    TypeOrmModule,
    CustomerRecurringPaymentService,
    CreateRecurringPaymentService,
    RecurringPaymentUpdateService,
  ],
})
export class RecurringPaymentModule {}
