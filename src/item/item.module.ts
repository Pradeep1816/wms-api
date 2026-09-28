import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Item } from './entities/item.entity';
import { ItemLocationStock } from './entities/item-location-stock.entity';
import { ItemCategory } from './entities/item-category.entity';
import { Location } from '../location/entities/location.entity';
import { ItemController } from './controllers/item.controller';
import { ItemService } from './services/item.service';
import { ItemRepository } from './repositories/item.repository';
import { AuthModule } from '../auth/auth.module';
import { LocationModule } from 'src/location/location.module';
import { TaxStatus } from '../tax/entities/tax-status.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Item, ItemLocationStock, ItemCategory, Location, TaxStatus])
, AuthModule, LocationModule],

  controllers: [ItemController],
  providers: [ItemService, ItemRepository],
  exports: [ItemService, ItemRepository],
})
export class ItemModule {}
