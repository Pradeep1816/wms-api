import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SalesReportController } from './controllers/sales-report.controller';
import { PaymentsReportController } from './controllers/payments-report.controller';
import { DiscountsReportController } from './controllers/discounts-report.controller';
import { RentalReportController } from './controllers/rental-report.controller';
import { ItemCategoryReportController } from './controllers/item-category-report.controller';
import { ItemsReportController } from './controllers/items-report.controller';
import { BirthdaysReportController } from './controllers/student-birthdays-report.controller';
import { FinancialSummaryController } from './controllers/financial-summary.controller';
import { ItemCategoryReportService } from './services/item-category-report.service';
import { TaxCollectedReportController } from './controllers/tax-collected-report.controller';
import { TaxCollectedReportService } from './services/tax-collected-report.service';
import { SalesReportService } from './services/sales-report.service';
import { PaymentsReportService } from './services/payments-report.service';
import { DiscountsReportService } from './services/discounts-report.service';
import { RentalReportService } from './services/rental-report.service';
import { ItemsReportService } from './services/items-report.service';
import { BirthdaysReportService } from './services/student-birthdays-report.service';
import { PrepaidFutureGroupLessonsService } from './services/financial-summary-service/prepaid-future-group-lessons.service';
import { PaidUnscheduledGroupLessonsService } from './services/financial-summary-service/paid-unscheduled-group-lessons.service';
import { PrepaidFuturePrivateLessonsService } from './services/financial-summary-service/prepaid-future-private-lessons.service';
import { PaidUnscheduledPrivateLessonsService } from './services/financial-summary-service/paid-unscheduled-private-lessons.service';
import { ActiveOutstandingInvoicesService } from './services/financial-summary-service/active-outstanding-invoices.service';
import { InactiveOutstandingInvoicesService } from './services/financial-summary-service/inactive-outstanding-invoices.service';
import { ActiveCustomersWithCreditService } from './services/financial-summary-service/active-customers-with-credit.service';
import { InactiveCustomersWithCreditService } from './services/financial-summary-service/inactive-customers-with-credit.service';
import { GenerateSummaryService } from './services/financial-summary-service/generate-summary.service';
import { LocationReportService } from './services/all-locations-report.service';
import { RoyaltyReportService } from './services/royalty-report.service';
import { RoyaltyReportController } from './controllers/royalty-report.controller';
import { RoyaltyFreeItemsReportService } from './services/royalty-free-items-report.service';
import { RoyaltyFreeItemsReportController } from './controllers/royalty-free-items-report.controller';
import { AuthModule } from '../auth/auth.module';
import { LocationModule } from '../location/location.module';
import { Invoice } from '../invoice/entities/invoice.entity';
import { InvoiceLineItem } from '../invoice/entities/invoice-line-item.entity';
import { InvoiceLineItemDiscount } from '../invoice/entities/invoice-line-item-discount.entity';
import { Item } from '../item/entities/item.entity';
import { ItemCategory } from '../item/entities/item-category.entity';
import { Payment } from '../payment/entities/payment.entity';
import { PaymentMethod } from '../payment/entities/payment-method.entity';
import { PaymentFrequency } from '../payment/entities/payment-frequency.entity';
import { User } from '../user/entities/user.entity';
import { UserProfile } from '../user/entities/user-profile.entity';
import { UserLocation } from '../user/entities/user-location.entity';
import { Location } from '../location/entities/location.entity';
import { InvoiceReverse } from '../invoice/entities/invoice-reverse.entity';
import { EquipmentRental } from '../equipment-rental/entities/equipment-rental.entity';
import { Student } from '../student/entities/student.entity';
import { Enrolment } from '../enrolment/entities/enrolment.entity';
import { Lesson } from '../lesson/entities/lesson.entity';
import { GroupLesson } from '../lesson/entities/group-lesson.entity';
import { PrivateLesson } from '../lesson/entities/private-lesson.entity';
import { Course } from '../course/entities/course.entity';
import { CustomerAccount } from '../customer/entities/customer-account.entity';
import { TaxCode } from '../tax/entities/tax-code.entity';
import { LocationDebt } from '../location/entities/location-debt.entity';
import { LocationReportController } from './controllers/all-locations-report.controller';
import { DiscountsReportRepository } from './repositories/discounts-report.repository';
import { DiscountsReportTransformationService } from './services/transformations/discounts-report-transformation.service';
import { AccountReceivableController } from './controllers/account-receivable.controller';
import { AccountReceivableService } from './services/account-receivable.service';
import { AccountReceivableRepository } from './repositories/account-receivable.repository';
import { PaymentsReportRepository } from './repositories/payments-report.repository';
import { PaymentsReportTransformationService } from './services/transformations/payments-report-transformation.service';
import { StudentBirthdaysReportRepository } from './repositories/student-birthdays-report.repository';
import { PaymentBasedRoyaltyReportRepository } from './repositories/payment-based-royalty-report.repository';
import { RoyaltyReportRepository } from './repositories/royalty-report.repository';
import { AllLocationsReportRepository } from './repositories/all-locations-report.repository';
import { RoyaltyTransaction } from '../payment/entities/royalty-transaction.entity';
import { RoyaltyAuditController } from './controllers/royalty-audit.controller';
import { RoyaltyAuditRepository } from './repositories/royalty-audit.repository';
import { RoyaltyAuditService } from './services/royalty-audit.service';
import { RoyaltyComparisonController } from './controllers/royalty-comparison.controller';
import { RoyaltyComparisonService } from './services/royalty-comparison.service';
import { RoyaltyComparisonRepository } from './repositories/royalty-comparison.repository';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Invoice,
      InvoiceLineItem,
      InvoiceLineItemDiscount,
      Item,
      ItemCategory,
      Payment,
      PaymentMethod,
      PaymentFrequency,
      User,
      UserProfile,
      UserLocation,
      Location,
      InvoiceReverse,
      EquipmentRental,
      Student,
      Enrolment,
      Lesson,
      GroupLesson,
      PrivateLesson,
      Course,
      CustomerAccount,
      TaxCode,
      LocationDebt,
      RoyaltyTransaction,
    ]),
    AuthModule,
    LocationModule,
  ],
  controllers: [SalesReportController, PaymentsReportController, DiscountsReportController, RentalReportController, ItemCategoryReportController, ItemsReportController, LocationReportController, RoyaltyFreeItemsReportController, RoyaltyReportController, RoyaltyComparisonController, RoyaltyAuditController, TaxCollectedReportController, BirthdaysReportController, FinancialSummaryController, AccountReceivableController],
  providers: [
    ItemCategoryReportService, 
    SalesReportService, 
    PaymentsReportService,
    PaymentsReportRepository,
    StudentBirthdaysReportRepository,
    PaymentsReportTransformationService,
    DiscountsReportService, 
    DiscountsReportRepository,
    DiscountsReportTransformationService,
    RentalReportService, 
    ItemsReportService, 
    LocationReportService, 
    RoyaltyFreeItemsReportService, 
    RoyaltyReportService, 
    RoyaltyComparisonService,
    RoyaltyComparisonRepository,
    TaxCollectedReportService, 
    BirthdaysReportService, 
    AccountReceivableService,
    AccountReceivableRepository,
    PaymentBasedRoyaltyReportRepository,
    RoyaltyReportRepository,
    AllLocationsReportRepository,
    RoyaltyAuditRepository,
    RoyaltyAuditService,
    PrepaidFutureGroupLessonsService,
    PaidUnscheduledGroupLessonsService,
    PrepaidFuturePrivateLessonsService,
    PaidUnscheduledPrivateLessonsService,
    ActiveOutstandingInvoicesService,
    InactiveOutstandingInvoicesService,
    ActiveCustomersWithCreditService,
    InactiveCustomersWithCreditService,
    GenerateSummaryService,
  ],
  exports: [
    ItemCategoryReportService, 
    SalesReportService, 
    PaymentsReportService, 
    PaymentsReportRepository, 
    StudentBirthdaysReportRepository,
    DiscountsReportService, 
    DiscountsReportRepository,
    DiscountsReportTransformationService,
    RentalReportService, 
    ItemsReportService, 
    LocationReportService, 
    RoyaltyFreeItemsReportService, 
    RoyaltyReportService, 
    TaxCollectedReportService, 
    BirthdaysReportService, 
    AccountReceivableService,
    AccountReceivableRepository,
    PaymentBasedRoyaltyReportRepository,
    RoyaltyReportRepository,
    PrepaidFutureGroupLessonsService,
    PaidUnscheduledGroupLessonsService,
    PrepaidFuturePrivateLessonsService,
    PaidUnscheduledPrivateLessonsService,
    ActiveOutstandingInvoicesService,
    InactiveOutstandingInvoicesService,
    ActiveCustomersWithCreditService,
    InactiveCustomersWithCreditService,
    GenerateSummaryService,
  ],
})
export class ReportModule {}
