import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Payment } from './entities/payment.entity';
import { PaymentMethod } from './entities/payment-method.entity';
import { PaymentFrequency } from './entities/payment-frequency.entity';
import { ProformaPaymentFrequency } from './entities/proforma-payment-frequency.entity';
import { PaymentService } from './services/payment.service';
import { PaymentEditInfoLessonsService } from './services/payment-edit-info-lessons.service';
import { PaymentEditInfoGroupLessonsService } from './services/payment-edit-info-group-lessons.service';
import { PaymentEditInfoInvoicesService } from './services/payment-edit-info-invoices.service';
import { PaymentEditInfoUsedService } from './services/payment-used.service';
import { PaymentQueryRepository } from './repositories/payment.repository';
import { PaymentListRepository } from './repositories/payment-list.repository';
import { PaymentTransformationService } from './services/transformation/payment-transformation.service';
import { PaymentCalculationService } from './services/calculation/payment-calculation.service';
import { PaymentListTransformation } from './services/transformation/payment-list.transformation';
import { PaymentEditInfoTransformation } from './services/transformation/payment-edit-info.transformation';
import { ReceicePaymentCreditService } from './services/receice-payment-credit.service';
import { PaymentMethodService } from './services/payment-method.service';
import { PaymentFrequencyService } from './services/payment-frequency.service';
import { CustomerValidationModule } from '../shared/customer-validation.module';
import { User } from '../user/entities/user.entity';
import { UserLocation } from '../user/entities/user-location.entity';
import { LocationModule } from '../location/location.module';
import { AuthModule } from '../auth/auth.module';
import { Location } from '../location/entities/location.entity';
import { LessonModule } from '../lesson/lesson.module';
import { InvoiceModule } from '../invoice/invoice.module';

import { PaymentController } from './controllers/payment.controller';
import { PaymentDeleteController } from './controllers/payment-delete.controller';
import { InvoiceReceivePaymentController } from './controllers/receive-payment.controller';
import { PaymentEditController } from './controllers/payment-edit.controller';
import { InvoiceReceivePaymentService } from './services/receive-payment.service';
import { ReceivePaymentCashApplierService } from './services/receive-payment/receive-payment-cash-applier.service';
import { ReceivePaymentCreditApplierService } from './services/receive-payment/receive-payment-credit-applier.service';
import { ReceivePaymentNegativeService } from './services/receive-payment/receive-payment-negative.service';
import { ReceivePaymentPaymentFactoryService } from './services/receive-payment/receive-payment-payment-factory.service';
import { ReceivePaymentPostProcessorService } from './services/receive-payment/receive-payment-post-processor.service';
import { ReceivePaymentValidationService } from './services/receive-payment/receive-payment-validation.service';
import { ReceivePaymentWorkBuilderService } from './services/receive-payment/receive-payment-work-builder.service';
import { PaymentRoyaltyRecognitionService } from './services/payment-royalty-recognition.service';
import { RoyaltyLedgerModule } from './royalty-ledger.module';
import { PaymentRoyaltyAdjustmentService } from './services/payment-royalty-adjustment.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Payment, 
      PaymentMethod, 
      PaymentFrequency, 
      ProformaPaymentFrequency,
      User,
      UserLocation,
      Location,
    ]),
    RoyaltyLedgerModule,
    LocationModule,
    CustomerValidationModule,
    AuthModule,
    LessonModule,
    InvoiceModule,
  ],
  providers: [
    PaymentService,
    PaymentEditInfoLessonsService,
    PaymentEditInfoGroupLessonsService,
    PaymentEditInfoInvoicesService,
    PaymentEditInfoUsedService,
    PaymentQueryRepository,
    PaymentListRepository,
    PaymentTransformationService,
    PaymentCalculationService,
    PaymentListTransformation,
    PaymentEditInfoTransformation,
    ReceicePaymentCreditService,
    PaymentMethodService,
    PaymentFrequencyService,
    InvoiceReceivePaymentService,
    ReceivePaymentCashApplierService,
    ReceivePaymentCreditApplierService,
    ReceivePaymentNegativeService,
    ReceivePaymentPaymentFactoryService,
    ReceivePaymentPostProcessorService,
    ReceivePaymentValidationService,
    ReceivePaymentWorkBuilderService,
    PaymentRoyaltyRecognitionService,
    PaymentRoyaltyAdjustmentService,
  ],
  controllers: [PaymentController, PaymentDeleteController, InvoiceReceivePaymentController, PaymentEditController],
  exports: [
    PaymentService,
    PaymentQueryRepository,
    ReceicePaymentCreditService,
    PaymentMethodService,
    RoyaltyLedgerModule,
  ],
})
export class PaymentModule {}
