import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  Query,
  Delete,
  Patch,
  UseGuards,
  Req,
} from '@nestjs/common';
import { PosTransactionService } from './pos-transaction.service';
import { CreatePosTransactionDto } from './dto/create-pos-transaction.dto';
import { AddLineItemDto } from './dto/add-line-item.dto';
import { UpdateLineItemDto } from './dto/update-line-item.dto';
import { ApplyDiscountDto } from './dto/apply-discount.dto';
import { ProcessPaymentDto } from './dto/process-payment.dto';
import { UpdatePosTransactionCustomerDto } from './dto/update-pos-transaction-customer.dto';
import { ReversePosTransactionDto } from './dto/reverse-pos-transaction.dto';
import { ParseIntPipe } from '@nestjs/common';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { LocationResolveGuard } from '../shared/guards/location.guard';
import { LocationId } from '../shared/decorators/location-id.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesEnum } from 'src/auth/enums/roles.enum';

@Controller('admin/v2/:location/pos')
@UseGuards(AuthGuard, RolesGuard, LocationResolveGuard)
export class PosTransactionController {
  constructor(private readonly posTransactionService: PosTransactionService) {}

  @Post('transaction')
  @Roles(RolesEnum.BACKEND_USER)
  async createTransaction(
    @Req() req: any,
    @LocationId() locationId: number,
    @Param('location') location: string,
    @Body() dto: CreatePosTransactionDto,
  ) {
    return this.posTransactionService.createTransaction(
      locationId,
      location,
      dto,
      req.user?.id,
    );
  }

  @Get('transaction/:id')
  @Roles(RolesEnum.BACKEND_USER)
  async getTransaction(
    @LocationId() locationId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.posTransactionService.getTransaction(id, locationId);
  }

  @Post('transaction/:id/invoice')
  @Roles(RolesEnum.BACKEND_USER)
  async createInvoice(
    @LocationId() locationId: number,
    @Param('location') locationSlug: string,
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any,
  ) {
    return this.posTransactionService.createInvoice(id, locationId, locationSlug, req.user.id);
  }

  @Get('items')
  @Roles(RolesEnum.BACKEND_USER)
  async getItemByCode(
    @Param('location') locationSlug: string,
    @Query('code') code: string,
  ) {
    return this.posTransactionService.findItemByCode(locationSlug, code);
  }

  @Get('payment-history')
  @Roles(RolesEnum.BACKEND_USER)
  async getPaymentHistory(
    @LocationId() locationId: number,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('customerId') customerId?: string,
  ) {
    return this.posTransactionService.getPaymentHistory(
      locationId,
      Number(page) || 1,
      Number(limit) || 20,
      Number(customerId) || undefined,
    );
  }

  @Post('transaction/:id/line-items')
  @Roles(RolesEnum.BACKEND_USER)
  async addLineItem(
    @LocationId() locationId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AddLineItemDto,
  ) {
    return this.posTransactionService.addLineItem(id, dto, locationId);
  }

  @Patch('transaction/:transactionId/line-items/:lineItemId')
  @Roles(RolesEnum.BACKEND_USER)
  async updateLineItem(
    @LocationId() locationId: number,
    @Param('transactionId', ParseIntPipe) transactionId: number,
    @Param('lineItemId', ParseIntPipe) lineItemId: number,
    @Body() dto: UpdateLineItemDto,
  ) {
    return this.posTransactionService.updateLineItem(
      transactionId,
      lineItemId,
      dto,
      locationId,
    );
  }

  @Delete('transaction/:transactionId/line-items/:lineItemId')
  @Roles(RolesEnum.BACKEND_USER)
  async removeLineItem(
    @LocationId() locationId: number,
    @Param('transactionId', ParseIntPipe) transactionId: number,
    @Param('lineItemId', ParseIntPipe) lineItemId: number,
  ) {
    return this.posTransactionService.removeLineItem(
      transactionId,
      lineItemId,
      locationId,
    );
  }

  @Patch('transaction/:id/customer')
  @Roles(RolesEnum.BACKEND_USER)
  async updateCustomer(
    @LocationId() locationId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePosTransactionCustomerDto,
  ) {
    return this.posTransactionService.updateCustomer(id, dto, locationId);
  }

  @Patch('transaction/:id/cancel')
  @Roles(RolesEnum.BACKEND_USER)
  async cancelTransaction(
    @LocationId() locationId: number,
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.posTransactionService.cancelTransaction(
      id,
      locationId,
      req.user?.id,
    );
  }

  @Post('transaction/:id/reversal')
  @Roles(RolesEnum.ADMINISTRATOR, RolesEnum.OWNER)
  async reverseTransaction(
    @LocationId() locationId: number,
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReversePosTransactionDto,
  ) {
    return this.posTransactionService.reverseTransaction(
      id,
      locationId,
      dto,
      req.user?.id,
    );
  }

  @Patch('transaction/:id/discount')
  @Roles(RolesEnum.BACKEND_USER)
  async applyDiscount(
    @LocationId() locationId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ApplyDiscountDto,
  ) {
    return this.posTransactionService.applyDiscount(
      id,
      dto.discountAmount,
      locationId,
    );
  }

  @Post('payment')
  @Roles(RolesEnum.BACKEND_USER)
  async processPayment(
    @LocationId() locationId: number,
    @Req() req: any,
    @Body() dto: ProcessPaymentDto,
  ) {
    return this.posTransactionService.processPayment(
      dto,
      locationId,
      req.user?.id,
    );
  }
}
