import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EquipmentRental } from './entities/equipment-rental.entity';
import { EquipmentRentalInstrument } from './entities/equipment-rental-instrument.entity';
import { EquipmentRentalInvoice } from './entities/equipment-rental-invoice.entity';
import { Student } from '../student/entities/student.entity';
import { PaymentFrequency } from '../payment/entities/payment-frequency.entity';
import { User } from '../user/entities/user.entity';
import { UserContact } from '../user/entities/user-contact.entity';
import { UserAddress } from '../user/entities/user-address.entity';
import { City } from '../location/entities/city.entity';
import { Invoice } from '../invoice/entities/invoice.entity';
import { InvoiceLineItem } from '../invoice/entities/invoice-line-item.entity';
import { RbacAuthAssignment } from '../auth/entities/rbac-auth-assignment.entity';
import { LocationModule } from '../location/location.module';
import { AuthModule } from '../auth/auth.module';
import { TaxModule } from '../tax/tax.module';
import { EquipmentRentalService } from './services/equipment-rental.service';
import { EquipmentRentalCreateService } from './services/equipment-rental-create.service';
import { EquipmentRentalUpdateService } from './services/equipment-rental-update.service';
import { EquipmentRentalDeleteService } from './services/equipment-rental-delete.service';
import { EquipmentRentalReturnService } from './services/equipment-rental-return.service';
import { EquipmentRentalRepository } from './repositories/equipment-rental.repository';
import { EquipmentRentalCreateRepository } from './repositories/equipment-rental-create.repository';
import { EquipmentRentalUpdateRepository } from './repositories/equipment-rental-update.repository';
import { EquipmentRentalDeleteRepository } from './repositories/equipment-rental-delete.repository';
import { EquipmentRentalReturnRepository } from './repositories/equipment-rental-return.repository';
import { EquipmentRentalTransformationService } from './services/equipment-rental-transformation.service';
import { EquipmentRentalModalTransformationService } from './services/equipment-rental-modal-transformation.service';
import { EquipmentRentalCalculationService } from './services/equipment-rental-calculation.service';
import { EquipmentRentalInstrumentCalculatorService } from './services/equipment-rental-instrument-calculation.service';
import { EquipmentRentalPrintTransformationService } from './services/transformations/equipment-rental-print-transformation.service';
import { EquipmentRentalReprintAgreementService } from './services/equipment-rental-reprint-agreement.service';
import { EquipmentRentalPrintController } from './controllers/equipment-rental-print.controller';
import { CustomerValidationModule } from '../shared/customer-validation.module';
import { ItemModule } from '../item/item.module';
import { StudentModule } from '../student/student.module';
import { CustomerEquipmentRentalsInfoRepository } from '../customer/repositories/customer-equipment-rentals-info.repository';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      EquipmentRental,
      EquipmentRentalInstrument,
      EquipmentRentalInvoice,
      Student,
      PaymentFrequency,
      User,
      UserContact,
      UserAddress,
      City,
      Invoice,
      InvoiceLineItem,
      RbacAuthAssignment,
    ]),
    LocationModule,
    AuthModule,
    CustomerValidationModule,
    ItemModule,
    StudentModule,
    TaxModule,
  ],
  controllers: [
    EquipmentRentalPrintController,
  ],
  providers: [
    EquipmentRentalService,
    EquipmentRentalReprintAgreementService,
    EquipmentRentalCreateService,
    EquipmentRentalUpdateService,
    EquipmentRentalDeleteService,
    EquipmentRentalReturnService,
    EquipmentRentalRepository,
    EquipmentRentalCreateRepository,
    EquipmentRentalUpdateRepository,
    EquipmentRentalDeleteRepository,
    EquipmentRentalReturnRepository,
    EquipmentRentalTransformationService,
    EquipmentRentalModalTransformationService,
    EquipmentRentalPrintTransformationService,
    EquipmentRentalCalculationService,
    EquipmentRentalInstrumentCalculatorService,
    CustomerEquipmentRentalsInfoRepository,
  ],
  exports: [
    EquipmentRentalService,
    EquipmentRentalCreateService,
    EquipmentRentalUpdateService,
    EquipmentRentalDeleteService,
    EquipmentRentalReturnService,
    EquipmentRentalRepository,
    EquipmentRentalCreateRepository,
    EquipmentRentalUpdateRepository,
    EquipmentRentalDeleteRepository,
    EquipmentRentalReturnRepository,
  ],
})
export class EquipmentRentalModule {}
