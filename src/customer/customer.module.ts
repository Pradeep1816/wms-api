import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomerController } from './controllers/customer.controller';
import { CustomerInvoicePrintController } from './controllers/customer-invoice-print.controller';
import { CustomerListController } from './controllers/customer-list.controller';
import { CustomerMergeController } from './controllers/customer-merge.controller';
import { CustomerPrepaidLessonController } from './controllers/customer-prepaid-lesson.controller';
import { CustomerAvailableCreditsController } from './controllers/customer-available-credits.controller';
import { CustomerEquipmentRentalController } from './controllers/customer-equipment-rental.controller';
import { CustomerService } from './services/customer.service';
import { CustomerListService } from './services/customer-list.service';
import { MergeCustomerService } from './services/customer-merge.service';
import { MergeCustomerTransformationService } from './services/transformation/customer-merge-transformation.service';
import { CustomerMergePreviewTransformationService } from './services/transformation/customer-merge-preview-transformation.service';
import { CustomerInfoService } from './services/customer-info.service';
import { CustomerInfoController } from './controllers/customer-info.controller';
import { CustomerItemPurchasedReportController } from './controllers/customer-item-purchased-report.controller';
import { CustomerListRepository } from './repositories/customers.repository';
import { CustomersRepository } from './repositories/customer-list.repository';
import { CustomersInfoRepository } from './repositories/customers-info.repository';
import { CustomersInfoProfileRepository } from './repositories/customers-info-profile.repository';
import { CustomersInfoEmailRepository } from './repositories/customers-info-email.repository';
import { CustomersInfoPhoneRepository } from './repositories/customers-info-phone.repository';
import { CustomersInfoAddressRepository } from './repositories/customers-info-address.repository';
import { CustomersInfoDiscountRepository } from './repositories/customers-info-discount.repository';
import { CustomersInfoOpeningBalanceRepository } from './repositories/customers-info-opening-balance.repository';
import { MergeCustomersRepository } from './repositories/customer-merge.repository';
import { MergeCustomerPreviewRepository } from './repositories/customer-merge-preview.repository';
import { LocationModule } from '../location/location.module';
import { AuthModule } from '../auth/auth.module';
import { StudentModule } from '../student/student.module';
import { EnrolmentModule } from '../enrolment/enrolment.module';
import { LessonModule } from '../lesson/lesson.module';
import { InvoiceModule } from '../invoice/invoice.module';

// Import all required entities
import { User } from '../user/entities/user.entity';
import { UserProfile } from '../user/entities/user-profile.entity';
import { UserContact } from '../user/entities/user-contact.entity';
import { UserPhone } from '../user/entities/user-phone.entity';
import { UserEmail } from '../user/entities/user-email.entity';
import { UserAddress } from '../user/entities/user-address.entity';
import { UserLocation } from '../user/entities/user-location.entity';
import { Label } from '../user/entities/label.entity';
import { Location } from '../location/entities/location.entity';
import { City } from '../location/entities/city.entity';
import { Province } from '../location/entities/province.entity';
import { Country } from '../location/entities/country.entity';
import { Student } from '../student/entities/student.entity';
import { CustomerAccount } from './entities/customer-account.entity';
import { CustomerEmailNotification } from './entities/customer-email-notification.entity';
import { NotificationEmailType } from './entities/notification-email-type.entity';
import { CustomerReferralSources } from './entities/customer-referral-sources.entity';
import { CustomerDiscount } from './entities/customer-discount.entity';
import { CustomerPaymentPreference } from './entities/customer-payment-preference.entity';
import { Program } from '../program/entities/program.entity';
import { PaymentFrequency } from '../payment/entities/payment-frequency.entity';
import { LocationWalkinCustomer } from '../location/entities/location-walkin-customer.entity';
import { ReferralSourceModule } from '../referral-source/referral-source.module';
import { CommentModule } from '../comment/comment.module';
import { Lesson } from '../lesson/entities/lesson.entity';
import { PrivateLesson } from '../lesson/entities/private-lesson.entity';
import { GroupLesson } from '../lesson/entities/group-lesson.entity';
import { Invoice } from '../invoice/entities/invoice.entity';
import { InvoiceLineItem } from '../invoice/entities/invoice-line-item.entity';
import { InvoiceReverse } from '../invoice/entities/invoice-reverse.entity';
import { Payment } from '../payment/entities/payment.entity';
import { PaymentModule } from '../payment/payment.module';
import { PaymentMethod } from '../payment/entities/payment-method.entity';
import { Item } from '../item/entities/item.entity';
import { ItemCategory } from '../item/entities/item-category.entity';
import { CustomerItemPurchasedReportService } from './services/customer-item-purchased-report.service';
import { CustomerItemPurchasedReportRepository } from './repositories/customer-item-purchased-report.repository';
import { CustomerItemPurchasedReportTransformationService } from './services/transformation/customer-item-purchased-report-transformation.service';
import { LogModule } from '../log/log.module';
import { Note } from '../comment/entities/notes.entity';
import { LogHistory } from '../log/entities/log-history.entity';
import { EquipmentRentalModule } from '../equipment-rental/equipment-rental.module';
import { RecurringPaymentModule } from '../recurring-payment/recurring-payment.module';
import { CustomerValidationModule } from '../shared/customer-validation.module';
import { Enrolment } from '../enrolment/entities/enrolment.entity';
import { EmailTemplate } from '../notification/entities/email-template.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      UserProfile,
      UserContact,
      UserPhone,
      UserEmail,
      UserAddress,
      UserLocation,
      Label,
      Location,
      City,
      Province,
      Country,
      Student,
      CustomerAccount,
      CustomerEmailNotification,
      NotificationEmailType,
      CustomerReferralSources,
      CustomerDiscount,
      CustomerPaymentPreference,
      Program,
      PaymentFrequency,
      LocationWalkinCustomer,
      Lesson,
      PrivateLesson,
      GroupLesson,
      Enrolment,
      Invoice,
      InvoiceLineItem,
      InvoiceReverse,
      Payment,
      PaymentMethod,
      Item,
      ItemCategory,
      Note,
      LogHistory,
      EmailTemplate,
    ]),
    LocationModule,
    AuthModule,
    StudentModule,
    EnrolmentModule,
    LessonModule,
    InvoiceModule,
    PaymentModule,
    CustomerValidationModule,
    ReferralSourceModule,
    CommentModule,
    LogModule,
    EquipmentRentalModule,
    RecurringPaymentModule,
  ],
  controllers: [
    CustomerListController,
    CustomerController,
    CustomerInvoicePrintController,
    CustomerMergeController,
    CustomerInfoController,
    CustomerPrepaidLessonController,
    CustomerAvailableCreditsController,
    CustomerItemPurchasedReportController,
    CustomerEquipmentRentalController,
  ],
  providers: [
    CustomerService,
    CustomerListService,
    CustomersRepository,
    MergeCustomerService,
    MergeCustomerTransformationService,
    CustomerMergePreviewTransformationService,
    CustomerInfoService,
    CustomerListRepository,
    MergeCustomersRepository,
    MergeCustomerPreviewRepository,
    CustomersInfoRepository,
    CustomersInfoProfileRepository,
    CustomersInfoEmailRepository,
    CustomersInfoPhoneRepository,
    CustomersInfoAddressRepository,
    CustomersInfoDiscountRepository,
    CustomersInfoOpeningBalanceRepository,
    CustomerItemPurchasedReportService,
    CustomerItemPurchasedReportRepository,
    CustomerItemPurchasedReportTransformationService,
  ],
  exports: [
    CustomerService,
    CustomerListService,
    CustomersRepository,
    MergeCustomerService,
    CustomerMergePreviewTransformationService,
    CustomerInfoService,
    CustomerListRepository,
    MergeCustomersRepository,
    MergeCustomerPreviewRepository,
    CustomersInfoRepository,
    CustomersInfoProfileRepository,
    CustomersInfoEmailRepository,
    CustomersInfoPhoneRepository,
    CustomersInfoAddressRepository,
    CustomersInfoDiscountRepository,
    CustomersInfoOpeningBalanceRepository,
  ],
})
export class CustomerModule {}
