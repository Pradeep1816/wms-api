import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Location } from './entities/location.entity';
import { LocationFlags } from './entities/location-flags.entity';
import { LocationAvailability } from './entities/location-availability.entity';
import { LocationDebt } from './entities/location-debt.entity';
import { LocationPaymentPreference } from './entities/location-payment-preference.entity';
import { LocationWalkinCustomer } from './entities/location-walkin-customer.entity';
import { City } from './entities/city.entity';
import { Province } from './entities/province.entity';
import { Country } from './entities/country.entity';
import { LocationService } from './services/location.service';
import { LocationGeodataService } from './services/location-geodata.service';
import { LocationDetailsService } from './services/location-info.service';
import { LocationRepository } from './repositories/location.repository';
import { LocationDetailsRepository } from './repositories/location-info.repository';
import { LocationCreateRepository } from './repositories/location-create-repositories/location-create.repository';
import { LocationCreateAvailabilityRepository } from './repositories/location-create-repositories/location-create-availability.repository';
import { LocationCreateDebtRepository } from './repositories/location-create-repositories/location-create-debt.repository';
import { LocationCreatePaymentPreferenceRepository } from './repositories/location-create-repositories/location-create-payment-preference.repository';
import { LocationCreateRbacRepository } from './repositories/location-create-repositories/location-create-rbac.repository';
import { LocationCreateWalkinCustomerRepository } from './repositories/location-create-repositories/location-create-walkin-customer.repository';
import { CityRepository } from './repositories/city.repository';
import { ProvinceRepository } from './repositories/province.repository';
import { CountryRepository } from './repositories/country.repository';
import { LocationController } from './controllers/location.controller';
import { LocationGeodataController } from './controllers/location-geodata.controller';
import { AuthModule } from '../auth/auth.module';
import { Invoice } from '../invoice/entities/invoice.entity';
import { InvoiceLineItem } from '../invoice/entities/invoice-line-item.entity';
import { Payment } from '../payment/entities/payment.entity';
import { TaxCode } from '../tax/entities/tax-code.entity';
import { User } from '../user/entities/user.entity';
import { UserProfile } from '../user/entities/user-profile.entity';
import { UserLocation } from '../user/entities/user-location.entity';
import { RbacAuthItem } from '../auth/entities/rbac-auth-item.entity';
import { RbacAuthItemChild } from '../auth/entities/rbac-auth-item-child.entity';
import { RbacAuthAssignment } from '../auth/entities/rbac-auth-assignment.entity';
import { ProvinceService } from './services/province.service';
import { ProvinceTransformationService } from './services/transformations/province-transformation.service';
import { ProvinceController } from './controllers/province.controller';
import { CountryController } from './controllers/country.controller';
import { CountryTransformationService } from './services/transformations/country-transformation.service';
import { CountryService } from './services/country.service';
import { CityService } from './services/city.service';
import { CityController } from './controllers/city.controller';
import { CityTransformationService } from './services/transformations/city-transformations.service';
import { LocationTransformationService } from './services/transformations/location-transformation.service';
import { LocationDetailsTransformationService } from './services/transformations/location-info-transformation.service';
import { LocationAvailabilityRepository } from './repositories/location-availability.repository';
import { LocationAvailabilityEditRepository } from './repositories/location-availability-edit.repository';
import { LocationAvailabilityService } from './services/location-availability.service';
import { LocationAvailabilityEditService } from './services/location-availability-edit.service';
import { LocationAvailabilityTransformationService } from './services/transformations/location-availability-transformation.service';
import { LocationAvailabilityController } from './controllers/location-availability.controller';
import { LocationCreateService } from './services/location-create.service';
import { LocationCreateController } from './controllers/location-create.controller';
import { LocationUpdateRepository } from './repositories/location-update.repository';
import { LocationUpdateService } from './services/location-update.service';
import { LocationUpdateController } from './controllers/location-update.controller';
import { LocationLegalCorporateNameService } from './services/location-legal-corporate-name.service';
import { LocationDeleteService } from './services/location-delete.service';
import { LocationDeleteController } from './controllers/location-delete.controller';
import { LocationHstService } from './services/location-hst.service';
import { ItemCategory } from '../item/entities/item-category.entity';
import { LocationCategoryRoyalty } from './entities/location-category-royalty.entity';
import { LocationCategoryRoyaltyController } from './controllers/location-category-royalty.controller';
import { LocationCategoryRoyaltyRepository } from './repositories/location-category-royalty.repository';
import { LocationCategoryRoyaltyService } from './services/location-category-royalty.service';
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Location,
      LocationFlags,
      LocationAvailability,
      LocationDebt,
      LocationPaymentPreference,
      LocationWalkinCustomer,
      City,
      Province,
      Country,
      Invoice,
      InvoiceLineItem,
      Payment,
      TaxCode,
      User,
      UserProfile,
      UserLocation,
      RbacAuthItem,
      RbacAuthItemChild,
      RbacAuthAssignment,
      ItemCategory,
      LocationCategoryRoyalty,
    ]),
    AuthModule,
  ],
  controllers: [
    LocationController,
    LocationGeodataController,
    LocationCreateController,
    LocationUpdateController,
    ProvinceController,
    CityController,
    CountryController,
    LocationAvailabilityController,
    LocationDeleteController,
    LocationCategoryRoyaltyController,
  ],
  providers: [
    LocationService,
    LocationGeodataService,
    LocationDetailsService,
    LocationRepository,
    LocationDetailsRepository,
    LocationCreateRepository,
    LocationCreateAvailabilityRepository,
    LocationCreateDebtRepository,
    LocationCreatePaymentPreferenceRepository,
    LocationCreateRbacRepository,
    LocationCreateWalkinCustomerRepository,
    LocationAvailabilityRepository,
    LocationAvailabilityEditRepository,
    LocationAvailabilityEditService,
    CityRepository,
    ProvinceRepository,
    CountryRepository,
    ProvinceService,
    ProvinceTransformationService,
    CityService,
    CityTransformationService,
    CountryService,
    CountryTransformationService,
    LocationTransformationService,
    LocationDetailsTransformationService,
    LocationAvailabilityService,
    LocationAvailabilityTransformationService,
    LocationCreateService,
    LocationUpdateRepository,
    LocationUpdateService,
    LocationDeleteService,
    LocationHstService,
    LocationLegalCorporateNameService,
    LocationCategoryRoyaltyRepository,
    LocationCategoryRoyaltyService,
  ],
  exports: [LocationService, LocationGeodataService, LocationDetailsService, LocationRepository, LocationAvailabilityRepository, LocationAvailabilityService, ProvinceRepository, ProvinceService, ProvinceTransformationService, CityService, CityTransformationService, LocationDeleteService],
})
export class LocationModule {}
