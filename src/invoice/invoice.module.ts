import { Module } from '@nestjs/common';
import { InvoicePosLinesService } from './services/invoice-pos-lines.service';
import { InvoicePosStockService } from './services/invoice-pos-stock.service';
import { InvoicePosReturnsService } from './services/invoice-pos-returns.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Invoice } from './entities/invoice.entity';
import { InvoiceLineItem } from './entities/invoice-line-item.entity';
import { InvoiceReverse } from './entities/invoice-reverse.entity';
import { InvoiceItemLesson } from './entities/invoice-item-lesson.entity';
import { InvoiceItemEnrolment } from './entities/invoice-item-enrolment.entity';
import { InvoiceLineItemDiscount } from './entities/invoice-line-item-discount.entity';
import { Location } from '../location/entities/location.entity';
import { User } from '../user/entities/user.entity';
import { ProFormaInvoiceService } from './services/pro-forma-invoice.service';
import { ProFormaInvoiceRepository } from './repositories/pro-forma-invoice.repository';
import { OutstandingInvoiceService } from './services/outstanding-invoice.service';
import { OutstandingInvoiceRepository } from './repositories/outstanding-invoice.repository';
import { OutstandingInvoiceTransformationService } from './services/transformations/outstanding-invoice-transformation.service';
import { OutstandingInvoiceCalculationService } from './services/calculations/outstanding-invoice-calculation.service';
import { CustomerInvoiceService } from './services/customer-invoice.service';
import { CustomerInvoiceRepository } from './repositories/customer-invoice.repository';
import { CustomerInvoiceTransformationService } from './services/transformations/customer-invoice-transformation.service';
import { CustomerInvoiceCalculationService } from './services/calculations/customer-invoice-calculation.service';
import { CustomerValidationModule } from '../shared/customer-validation.module';
import { LocationModule } from '../location/location.module';
import { AuthModule } from '../auth/auth.module';
import { Payment } from '../payment/entities/payment.entity';
import { PaymentMethod } from '../payment/entities/payment-method.entity';
import { ReceivePaymentInvoiceService } from './services/receive-payment-invoice.service';
import { ReceivePaymentInvoiceTransformationService } from './services/transformations/receive-payment-invoice-transformation.service';
import { ReceivePaymentInvoiceCreditService } from './services/receive-payment-invoice-credit.service';
import { InvoiceMonthlyRevenueRepository } from './repositories/invoice-monthly-revenue.repository';
import { AvailableCreditsService } from './services/available-credits.service';
import { AvailableCreditsTransformationService } from './services/transformations/available-credits-transformation.service';
import { InvoiceListController } from './controllers/invoice-list.controller';
import { InvoiceListService } from './services/invoice-list.service';
import { InvoiceListRepository } from './repositories/invoice-list.repository';
import { InvoiceListTransformationService } from './services/transformations/invoice-list-transformation.service';
import { UserInvoicedLessonsController } from './controllers/user-invoiced-lessons.controller';
import { UserInvoicedLessonsService } from './services/user-invoiced-lessons.service';
import { UserInvoicedLessonsTransformationService } from './services/transformations/user-invoiced-lessons-transformation.service';
import { UserInvoicedLessonsRepository } from './repositories/user-invoiced-lessons.repository';
import { TeacherModule } from '../teacher/teacher.module';
import { InvoiceDetailService } from './services/invoice-detail.service';
import { InvoiceDetailRepository } from './repositories/invoice-detail.repository';
import { InvoiceDetailController } from './controllers/invoice-detail.controller';
import { InvoiceItemsTransformationService } from './services/transformations/invoice-items-transformation.service';
import { InvoiceDiscountCalculator } from './services/calculations/invoice-discount.calculator';
import { InvoiceTotalsTransformationService } from './services/transformations/invoice-totals-transformation.service';
import { InvoicePayment } from './entities/invoice-payment.entity';
import { InvoicePaymentsTransformationService } from './services/transformations/invoice-payments-transformation.service';
import { InvoicePaymentDetailsService } from './services/invoice-payment-details.service';
import { InvoicePaymentDetailsRepository } from './repositories/invoice-payment-details.repository';
import { InvoicePaymentDetailsController } from './controllers/invoice-payment-details.controller';
import { InvoicePaymentEmailController } from './controllers/invoice-payment-email.controller';
import { InvoicePaymentEmailService } from './services/invoice-payment-email.service';
import { InvoicePaymentEmailRepository } from './repositories/invoice-payment-email.repository';
import { InvoicePaymentEmailTransformationService } from './services/transformations/invoice-payment-email-transformation.service';
import { InvoiceEmailStatementController } from './controllers/invoice-email-statement.controller';
import { InvoiceEmailStatementService } from './services/invoice-email-statement.service';
import { InvoiceEmailStatementRepository } from './repositories/invoice-email-statement.repository';
import { InvoiceEmailStatementTransformationService } from './services/transformations/invoice-email-statement-transformation.service';
import { EmailTemplate } from '../notification/entities/email-template.entity';
import { ReminderNote } from '../notification/entities/reminder-note.entity';
import { UserEmail } from '../user/entities/user-email.entity';
import { InvoiceDetailEditService } from './services/invoice-detail-edit.service';
import { InvoiceDetailEditRepository } from './repositories/invoice-detail-edit.repository';
import { UserCreateRepository } from '../user/repositories/user-create.repository';
import { UserProfile } from '../user/entities/user-profile.entity';
import { UserContact } from '../user/entities/user-contact.entity';
import { UserLocation } from '../user/entities/user-location.entity';
import { CustomerAccount } from '../customer/entities/customer-account.entity';
import { RbacAuthAssignment } from '../auth/entities/rbac-auth-assignment.entity';
import { RbacAuthItem } from '../auth/entities/rbac-auth-item.entity';
import { CustomerEmailNotification } from '../customer/entities/customer-email-notification.entity';
import { NotificationEmailType } from '../customer/entities/notification-email-type.entity';
import { ReleaseNotes } from '../release-notes/entities/release-notes.entity';
import { ReleaseNotesRead } from '../release-notes/entities/release-notes-read.entity';
import { InvoiceDetailsEditTransformationService } from './services/transformations/invoice-details-edit-transformation.service';
import { InvoiceVoidController } from './controllers/invoice-void.controller';
import { InvoiceVoidService } from './services/invoice-void.service';
import { InvoiceVoidRepository } from './repositories/invoice-void.repository';
import { Lesson } from '../lesson/entities/lesson.entity';
import { LessonPayment } from '../lesson/entities/lesson-payment.entity';
import { Note } from '../comment/entities/notes.entity';
import { ItemCategory } from '../item/entities/item-category.entity';
import { InvoiceReturnController } from './controllers/invoice-return.controller';
import { InvoiceReturnService } from './services/invoice-return.service';
import { InvoiceReturnRepository } from './repositories/invoice-return.repository';
import { CreditUsage } from '../payment/entities/credit-usage.entity';
import { PrivateLesson } from '../lesson/entities/private-lesson.entity';
import { GroupLesson } from '../lesson/entities/group-lesson.entity';
import { TaxCode } from 'src/tax/entities/tax-code.entity';
import { TaxTypeTaxStatusAssoc } from 'src/tax/entities/tax-type-tax-status-assoc.entity';
import { TaxStatus } from 'src/tax/entities/tax-status.entity';
import { TaxType } from 'src/tax/entities/tax-type.entity';
import { InvoiceLineItemController } from './controllers/invoice-line-item.controller';
import { InvoiceLineItemUpdateTransformationService } from './services/transformations/invoice-line-item-update-transformation.service';
import { InvoiceLineItemUpdateRepository } from './repositories/invoice-line-item-update.repository';
import { InvoiceLineItemUpdateService } from './services/invoice-line-item-update.service';
import { LocationWalkinCustomer } from '../location/entities/location-walkin-customer.entity';
import { InvoiceCreateController } from './controllers/invoice-create.controller';
import { InvoiceCreateService } from './services/invoice-create.service';
import { InvoiceCreateRepository } from './repositories/invoice-create.repository';
import { LogModule } from '../log/log.module';
import { LogLink } from '../log/entities/log-link.entity';
import { MailerService } from '../shared/services/mailer.service';
import { InvoiceLineItemDeleteService } from './services/invoice-line-item-delete.service';
import { InvoiceLineItemDeleteRepository } from './repositories/invoice-line-item-delete.repository';
import { InvoiceLineItemDeleteTransformationService } from './services/transformations/invoice-line-item-delete-transformation.service';
import { InvoiceLineItemCreateRepository } from './repositories/invoice-line-item-create.repository';
import { InvoiceLineItemCreateService } from './services/invoice-line-item-create.service';
import { InvoiceLineItemCreateTransformationService } from './services/transformations/invoice-line-item-create-transformation.service';
import { Item } from '../item/entities/item.entity';
import { CustomerDiscount } from '../customer/entities/customer-discount.entity';
import { InvoiceLineItemDiscountService } from './services/invoice-line-item-discount.service';
import { InvoiceLineItemDiscountRepository } from './repositories/invoice-line-item-discount.repository';
import { InvoiceLineItemEditTaxTransformationService } from './services/transformations/invoice-line-item-edit-tax-transformation.service';
import { InvoiceLineItemEditTaxRepository } from './repositories/invoice-line-item-edit-tax.repository';
import { InvoiceLineItemEditTaxService } from './services/invoice-line-item-edit-tax.service';
import { InvoicePaymentEditService } from './services/invoice-payment-edit.service';
import { InvoicePaymentEditRepository } from './repositories/invoice-payment-edit.repository';
import { InvoicePaymentEditTransformationService } from './services/transformations/invoice-payment-edit-transformation.service';
import { InvoiceLineItemShowRepository } from './repositories/invoice-line-item-show.repository';
import { InvoiceLineItemShowService } from './services/invoice-line-item-show.service';
import { InvoicePrintController } from './controllers/invoice-print.controller';
import { InvoicePrintService } from './services/invoice-print.service';
import { InvoicePrintRepository } from './repositories/invoice-print.repository';
import { InvoicePrintTransformationService } from './services/transformations/invoice-print-transformation.service';
import { CustomerInvoicePrintService } from './services/customer-invoice-print.service';
import { CustomerBalanceRecalculatorService } from '../shared/services/customer-balance-recalculator.service';
import { CustomerBalanceCalculationRepository } from '../customer/repositories/customer-balance-calculation.repository';
import { ReceivePaymentRepository } from './repositories/receive-payment.repository';
import { RoyaltyLedgerModule } from '../payment/royalty-ledger.module';
import { InvoiceReturnRoyaltyService } from './services/invoice-return-royalty.service';

@Module({
  imports: [
    RoyaltyLedgerModule,
    TypeOrmModule.forFeature([
      Invoice, 
      InvoiceLineItem, 
      InvoiceReverse, 
      InvoiceItemLesson, 
      InvoiceItemEnrolment, 
      InvoiceLineItemDiscount,
      InvoicePayment,
      Location,
      User,
      Payment,
      PaymentMethod,
      EmailTemplate,
      ReminderNote,
      UserEmail,
      UserProfile,
      UserContact,
      UserLocation,
      CustomerAccount,
      RbacAuthAssignment,
      RbacAuthItem,
      CustomerEmailNotification,
      NotificationEmailType,
      ReleaseNotes,
      ReleaseNotesRead,
      Lesson,
      LessonPayment,
      Note,
      ItemCategory,
      CreditUsage,
      Lesson,
      PrivateLesson,
      GroupLesson,
      TaxStatus,
      TaxTypeTaxStatusAssoc,
      TaxType,
      TaxCode,
      LocationWalkinCustomer,
      LogLink,
      Item,
      CustomerDiscount,
      LessonPayment,
    ]),
    LocationModule,
    CustomerValidationModule,
    AuthModule,
    TeacherModule,
    LogModule,
  ],
  controllers: [InvoiceListController, InvoiceDetailController, UserInvoicedLessonsController, InvoiceEmailStatementController, InvoiceVoidController, InvoiceReturnController, InvoiceLineItemController, InvoiceCreateController, InvoicePaymentDetailsController, InvoicePaymentEmailController, InvoicePrintController],
  providers: [
    InvoicePosReturnsService,
    InvoicePosLinesService,
    InvoicePosStockService,
    ProFormaInvoiceService, 
    ProFormaInvoiceRepository, 
    OutstandingInvoiceService, 
    OutstandingInvoiceRepository,
    OutstandingInvoiceTransformationService,
    OutstandingInvoiceCalculationService,
    CustomerInvoiceService,
    CustomerInvoiceRepository,
    CustomerInvoiceTransformationService,
    CustomerInvoiceCalculationService,
    ReceivePaymentInvoiceService,
    ReceivePaymentInvoiceTransformationService,
    ReceivePaymentInvoiceCreditService,
    InvoiceMonthlyRevenueRepository,
    AvailableCreditsService,
    AvailableCreditsTransformationService,
    InvoiceListService,
    InvoiceListRepository,
    InvoiceListTransformationService,
    UserInvoicedLessonsService,
    UserInvoicedLessonsRepository,
    UserInvoicedLessonsTransformationService,
    InvoiceDetailService,
    InvoiceDetailRepository,
    InvoiceItemsTransformationService,
    InvoiceDiscountCalculator,
    InvoiceTotalsTransformationService,
    InvoicePaymentsTransformationService,
    InvoiceEmailStatementService,
    InvoiceEmailStatementRepository,
    InvoiceEmailStatementTransformationService,
    InvoiceDetailEditService,
    InvoiceDetailEditRepository,
    UserCreateRepository,
    InvoiceDetailsEditTransformationService,
    InvoiceVoidService,
    InvoiceVoidRepository,
    InvoiceReturnService,
    InvoiceReturnRoyaltyService,
    InvoiceReturnRepository,
    InvoiceLineItemUpdateService,
    InvoiceLineItemUpdateRepository,
    InvoiceLineItemUpdateTransformationService,
    InvoiceCreateService,
    InvoiceCreateRepository,
    MailerService,
    InvoiceLineItemDeleteService,
    InvoiceLineItemDeleteRepository,
    InvoiceLineItemDeleteTransformationService,
    InvoiceLineItemCreateService,
    InvoiceLineItemCreateRepository,
    InvoiceLineItemCreateTransformationService,
    InvoiceLineItemShowService,
    InvoiceLineItemShowRepository,
    InvoicePaymentDetailsService,
    InvoicePaymentDetailsRepository,
    InvoicePaymentEmailService,
    InvoicePaymentEmailRepository,
    InvoicePaymentEmailTransformationService,
    InvoiceLineItemDiscountService,
    InvoiceLineItemDiscountRepository,
    InvoiceLineItemEditTaxService,
    InvoiceLineItemEditTaxTransformationService,
    InvoiceLineItemEditTaxRepository,
    InvoicePaymentEditService,
    InvoicePaymentEditRepository,
    InvoicePaymentEditTransformationService,
    CustomerBalanceRecalculatorService,
    CustomerBalanceCalculationRepository,
    InvoicePrintService,
    InvoicePrintRepository,
    InvoicePrintTransformationService,
    CustomerInvoicePrintService,
    ReceivePaymentRepository,
  ],
  exports: [
    InvoicePosLinesService,
    InvoiceCreateRepository,
    ProFormaInvoiceService, 
    OutstandingInvoiceService, 
    CustomerInvoiceService, 
    ReceivePaymentInvoiceService, 
    OutstandingInvoiceCalculationService, 
    ReceivePaymentInvoiceCreditService, 
    InvoiceMonthlyRevenueRepository, 
    AvailableCreditsService,
    OutstandingInvoiceRepository,
    InvoiceListService,
    CustomerInvoicePrintService,
    InvoiceEmailStatementService,
    InvoicePaymentEmailService,
    InvoicePaymentDetailsService,
    InvoicePaymentEditService,
    ReceivePaymentRepository,
    CustomerBalanceRecalculatorService,
  ],
})
export class InvoiceModule {}
