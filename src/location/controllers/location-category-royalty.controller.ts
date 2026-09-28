import {
  Body,
  Controller,
  Get,
  Put,
  Req,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { LocationId } from '../../shared/decorators/location-id.decorator';
import { LocationResolveGuard } from '../../shared/guards/location.guard';
import { ResponseHelper } from '../../shared/helpers/response.helper';
import { UpdateLocationCategoryRoyaltiesRequestDto } from '../dto/location-category-royalty.dto';
import { LocationCategoryRoyaltyService } from '../services/location-category-royalty.service';

@Controller('admin/v2/:location/category-royalties')
@UseGuards(AuthGuard, RolesGuard, LocationResolveGuard)
export class LocationCategoryRoyaltyController {
  constructor(private readonly service: LocationCategoryRoyaltyService) {}

  @Get()
  @Roles(RolesEnum.ADMINISTRATOR)
  async getRates(@LocationId() locationId: number) {
    const rates = await this.service.getRates(locationId);
    return ResponseHelper.success(rates, 'Location category royalties retrieved successfully');
  }

  @Put()
  @Roles(RolesEnum.ADMINISTRATOR)
  async updateRates(
    @LocationId() locationId: number,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    dto: UpdateLocationCategoryRoyaltiesRequestDto,
    @Req() req: any,
  ) {
    const rates = await this.service.updateRates(locationId, dto, req.user.id);
    return ResponseHelper.success(rates, 'Location category royalties updated successfully');
  }
}
