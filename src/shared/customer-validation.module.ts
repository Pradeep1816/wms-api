import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../user/entities/user.entity';
import { Location } from '../location/entities/location.entity';
import { UserLocation } from '../user/entities/user-location.entity';
import { CustomerValidationService } from './services/customer-validation.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Location, UserLocation]),
  ],
  providers: [CustomerValidationService],
  exports: [CustomerValidationService],
})
export class CustomerValidationModule {}
