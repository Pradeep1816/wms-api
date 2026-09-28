import { Controller, Post, Put, Delete, Param, Query, Body, UseGuards, ValidationPipe, Req, ParseIntPipe } from '@nestjs/common';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { ResponseHelper } from '../../shared/helpers/response.helper';
import { CreateEquipmentRentalDto } from '../../equipment-rental/dto/create-equipment-rental.dto';
import { UpdateEquipmentRentalDto } from '../../equipment-rental/dto/update-equipment-rental.dto';
import { EquipmentRentalCreateService } from '../../equipment-rental/services/equipment-rental-create.service';
import { EquipmentRentalUpdateService } from '../../equipment-rental/services/equipment-rental-update.service';
import { EquipmentRentalDeleteService } from '../../equipment-rental/services/equipment-rental-delete.service';
import { EquipmentRentalReturnService } from '../../equipment-rental/services/equipment-rental-return.service';

@Controller('admin/v2/:location/customers')
@UseGuards(AuthGuard, RolesGuard)
export class CustomerEquipmentRentalController {
  constructor(
    private readonly equipmentRentalCreateService: EquipmentRentalCreateService,
    private readonly equipmentRentalUpdateService: EquipmentRentalUpdateService,
    private readonly equipmentRentalDeleteService: EquipmentRentalDeleteService,
    private readonly equipmentRentalReturnService: EquipmentRentalReturnService,
  ) {}

  @Post(':id/equipment-rentals')
  @Roles(RolesEnum.BACKEND_USER)
  async createEquipmentRental(
    @Param('location') locationSlug: string,
    @Param('id') customerId: number,
    @Body(ValidationPipe) createDto: CreateEquipmentRentalDto,
    @Req() req: any,
  ): Promise<any> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return ResponseHelper.error('UNAUTHORIZED', 'User not authenticated');
      }
      const result = await this.equipmentRentalCreateService.createEquipmentRental(
        locationSlug,
        customerId,
        createDto,
        userId,
      );
      return ResponseHelper.success(result, 'Equipment rental created successfully');
    } catch (error) {
      console.error('Error in createEquipmentRental controller:', error);
      if (error.message.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      if (error.message.includes('required') || error.message.includes('invalid')) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to create equipment rental');
    }
  }

  @Put(':id/equipment-rentals')
  @Roles(RolesEnum.BACKEND_USER)
  async updateEquipmentRental(
    @Param('location') locationSlug: string,
    @Param('id') customerId: number,
    @Query('rentalId', ParseIntPipe) rentalId: number,
    @Body(ValidationPipe) updateDto: UpdateEquipmentRentalDto,
    @Req() req: any,
  ): Promise<any> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return ResponseHelper.error('UNAUTHORIZED', 'User not authenticated');
      }
      const result = await this.equipmentRentalUpdateService.updateEquipmentRental(
        locationSlug,
        customerId,
        rentalId,
        updateDto,
        userId,
      );
      return ResponseHelper.success(result, 'Equipment rental updated successfully');
    } catch (error) {
      console.error('Error in updateEquipmentRental controller:', error);
      if (error.message.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      if (error.message.includes('ongoing') || error.message.includes('30 days') || error.message.includes('does not belong')) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to update equipment rental');
    }
  }

  @Delete(':id/equipment-rentals')
  @Roles(RolesEnum.BACKEND_USER)
  async deleteEquipmentRental(
    @Param('location') locationSlug: string,
    @Param('id') customerId: number,
    @Query('rentalId', ParseIntPipe) rentalId: number,
    @Req() req: any,
  ): Promise<any> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return ResponseHelper.error('UNAUTHORIZED', 'User not authenticated');
      }
      const result = await this.equipmentRentalDeleteService.deleteEquipmentRental(
        locationSlug,
        customerId,
        rentalId,
        userId,
      );
      return ResponseHelper.success(result, 'Equipment rental deleted successfully');
    } catch (error) {
      console.error('Error in deleteEquipmentRental controller:', error);
      if (error.message.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      if (error.message.includes('does not belong') || error.message.includes('already deleted') || error.message.includes('without invoices')) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to delete equipment rental');
    }
  }

  @Post(':id/return')
  @Roles(RolesEnum.BACKEND_USER)
  async returnEquipmentRental(
    @Param('location') locationSlug: string,
    @Param('id') customerId: number,
    @Query('rentalId', ParseIntPipe) rentalId: number,
    @Req() req: any,
  ): Promise<any> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return ResponseHelper.error('UNAUTHORIZED', 'User not authenticated');
      }
      const result = await this.equipmentRentalReturnService.processReturn(
        locationSlug,
        customerId,
        rentalId,
        userId,
      );
      return ResponseHelper.success(result, 'Equipment rental returned successfully');
    } catch (error) {
      console.error('Error in returnEquipmentRental controller:', error);
      if (error.message.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      if (error.message.includes('does not belong') || error.message.includes('already returned') || error.message.includes('deleted')) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to return equipment rental');
    }
  }
}
