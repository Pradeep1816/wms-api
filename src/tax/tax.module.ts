import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TaxCode } from './entities/tax-code.entity';
import { TaxStatus } from './entities/tax-status.entity';
import { TaxType } from './entities/tax-type.entity';
import { TaxTypeTaxStatusAssoc } from './entities/tax-type-tax-status-assoc.entity';
import { TaxRepository } from './repositories/tax.repository';
import { TaxCodeController } from './controllers/tax.controller';
import { TaxService } from './services/tax.service';
import { TaxCodeTransformationService } from './services/transformations/tax-transformation.service';
import { AuthModule } from 'src/auth/auth.module';
import { LocationModule } from 'src/location/location.module';

@Module({
  imports: [TypeOrmModule.forFeature([TaxCode, TaxStatus, TaxType, TaxTypeTaxStatusAssoc])
, AuthModule,
  LocationModule,
],
   
  controllers: [TaxCodeController],
  providers: [TaxRepository,TaxService,TaxCodeTransformationService],
  exports: [TaxRepository,TaxService,TaxCodeTransformationService],
})
export class TaxModule {}
