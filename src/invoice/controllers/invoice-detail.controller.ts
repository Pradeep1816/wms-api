import { Controller, Get, Put, Post, Param, Query, Body, UseGuards, NotFoundException, BadRequestException, ValidationPipe } from '@nestjs/common';
import { InvoiceDetailService } from '../services/invoice-detail.service';
import { InvoiceDetailEditService } from '../services/invoice-detail-edit.service';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { LocationResolveGuard } from '../../shared/guards/location.guard';
import { LocationId } from '../../shared/decorators/location-id.decorator';
import { ResponseHelper } from '../../shared/helpers/response.helper';
import { InvoiceItemsRequestDto } from '../dto/invoice-items-request.dto';
import { UpdateInvoiceDetailRequestDto } from '../dto/update-invoice-detail.dto';
import { CreateWalkinCustomerDto } from '../dto/create-walkin-customer.dto';
import { UpdateWalkinCustomerDto } from '../dto/update-walkin-customer.dto';
import { AvailableCustomersRequestDto, AssignCustomerToInvoiceDto } from '../dto/assign-customer-to-invoice.dto';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../auth/services/auth.service';
import { AdjustTaxRequestDto } from '../dto/adjust-tax.dto';
import { CreateInvoiceMessageRequestDto, CreateInvoiceMessageResponseDto } from '../dto/create-invoice-message.dto';

@Controller('admin/v2/:location/invoices')
@UseGuards(AuthGuard, RolesGuard, LocationResolveGuard)
export class InvoiceDetailController {
  constructor(
    private readonly invoiceDetailService: InvoiceDetailService,
    private readonly invoiceDetailEditService: InvoiceDetailEditService,
  ) {}

  @Get('details/:id')
  @Roles(RolesEnum.BACKEND_USER)
  async getInvoiceDetail(
    @LocationId() locationId: number,
    @Param('location') locationSlug: string,
    @Param('id') invoiceId: number,
  ): Promise<any> {
    try {
      const invoiceDetail = await this.invoiceDetailService.getInvoiceDetail(
        locationId,
        locationSlug,
        invoiceId,
      );

      return ResponseHelper.success(invoiceDetail, 'Invoice detail retrieved successfully');
    } catch (error) {
      console.error('Error in getInvoiceDetail controller:', error);

      if (error instanceof NotFoundException) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }

      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to retrieve invoice detail');
    }
  }

  @Get('items/:id')
  @Roles(RolesEnum.BACKEND_USER)
  async getInvoiceItems(
    @LocationId() locationId: number,
    @Param('location') locationSlug: string,
    @Param('id') invoiceId: number,
    @Query(ValidationPipe) query: InvoiceItemsRequestDto,
  ): Promise<any> {
    try {
      const result = await this.invoiceDetailService.getInvoiceItems(
        locationId,
        locationSlug,
        invoiceId,
        query.enable,
        query.sort,
        query.order,
      );

      return ResponseHelper.success(result, 'Invoice items retrieved successfully');
    } catch (error) {
      console.error('Error in getInvoiceItems controller:', error);

      if (error instanceof NotFoundException) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }

      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to retrieve invoice items');
    }
  }

  @Get(':id/totals')
  @Roles(RolesEnum.BACKEND_USER)
  async getInvoiceTotals(
    @LocationId() locationId: number,
    @Param('id') invoiceId: number,
  ): Promise<any> {
    try {
      const result = await this.invoiceDetailService.getInvoiceTotals(
        locationId,
        invoiceId,
      );

      return ResponseHelper.success(result, 'Invoice totals retrieved successfully');
    } catch (error) {
      console.error('Error in getInvoiceTotals controller:', error);

      if (error instanceof NotFoundException) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }

      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to retrieve invoice totals');
    }
  }
  
  @Get('message/:id')
  @Roles(RolesEnum.BACKEND_USER)
  async getInvoiceMessage(
    @LocationId() locationId: number,
    @Param('location') locationSlug: string,
    @Param('id') invoiceId: number,
  ): Promise<any> {
    try {
      const result = await this.invoiceDetailService.getInvoiceMessage(
        locationId,
        locationSlug,
        invoiceId,
      );

      return ResponseHelper.success(result, 'Invoice message retrieved successfully');
    } catch (error) {
      console.error('Error in getInvoiceMessage controller:', error);

      if (error instanceof NotFoundException) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }

      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to retrieve invoice message');
    }
  }

  /**
   * Update invoice details (date only)
   */
  @Put('details/:id')
  @Roles(RolesEnum.BACKEND_USER)
  async updateInvoiceDetail(
    @LocationId() locationId: number,
    @Param('location') locationSlug: string,
    @Param('id') invoiceId: number,
    @Body(ValidationPipe) updateData: UpdateInvoiceDetailRequestDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<any> {
    try {
      const result = await this.invoiceDetailEditService.updateInvoiceDate(
        locationId,
        locationSlug,
        invoiceId,
        updateData,
        currentUser.id,
      );

      return ResponseHelper.success(result, 'Invoice date updated successfully');
    } catch (error) {
      console.error('Error in updateInvoiceDetail controller:', error);

      if (error instanceof NotFoundException) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      if (error instanceof BadRequestException) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }

      return ResponseHelper.error(
        'INTERNAL_SERVER_ERROR',
        'Failed to update invoice details',
      );
    }
  }

  /**
   * POST /admin/v2/:location/invoices/:id/walkin
   * Create a new walk-in customer and assign to invoice
   * Also updates all related payments to point to the new walk-in customer
   * 
   * Body:
   *   - firstName: string (required, min 2, max 255)
   *   - lastName: string (required, min 2, max 255)
   *   - email: string (optional, valid email format)
   */
  @Post(':id/walkin')
  @Roles(RolesEnum.BACKEND_USER)
  async createWalkinCustomer(
    @LocationId() locationId: number,
    @Param('location') locationSlug: string,
    @Param('id') invoiceId: number,
    @Body(ValidationPipe) createData: CreateWalkinCustomerDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<any> {
    try {
      const result = await this.invoiceDetailEditService.createWalkinCustomer(
        locationId,
        locationSlug,
        invoiceId,
        createData,
        currentUser.id,
      );

      return ResponseHelper.success(result, 'Walk-in customer added successfully');
    } catch (error) {
      console.error('Error in createWalkinCustomer controller:', error);

      if (error instanceof NotFoundException) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }

      if (error instanceof BadRequestException) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }

      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to create walk-in customer');
    }
  }

  /**
   * PUT /admin/v2/:location/invoices/:id/walkin
   * Update an existing walk-in customer (Edit walk-in)
   * 
   * Body:
   *   - firstName: string (required, min 2, max 255)
   *   - lastName: string (required, min 2, max 255)
   *   - email: string (optional, valid email format)
   */
  @Put(':id/walkin')
  @Roles(RolesEnum.BACKEND_USER)
  async updateWalkinCustomer(
    @LocationId() locationId: number,
    @Param('location') locationSlug: string,
    @Param('id') invoiceId: number,
    @Body(ValidationPipe) updateData: UpdateWalkinCustomerDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<any> {
    try {
      const result = await this.invoiceDetailEditService.updateWalkinCustomer(
        locationId,
        locationSlug,
        invoiceId,
        updateData,
        currentUser.id,
      );

      return ResponseHelper.success(result, 'Walk-in customer updated successfully');
    } catch (error) {
      console.error('Error in updateWalkinCustomer controller:', error);

      if (error instanceof NotFoundException) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }

      if (error instanceof BadRequestException) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }

      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to update walk-in customer');
    }
  }

  /**
   * Adjust invoice tax
   */
  @Put('adjust-tax/:id')
  @Roles(RolesEnum.BACKEND_USER)
  async adjustTax(
    @LocationId() locationId: number,
    @Param('location') locationSlug: string,
    @Param('id') invoiceId: number,
    @Body(ValidationPipe) requestDto: AdjustTaxRequestDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<any> {
    try {
      const result = await this.invoiceDetailEditService.adjustTax(
        locationId,
        locationSlug,
        invoiceId,
        requestDto,
        currentUser.id,
      );

      return ResponseHelper.success(result, 'Tax adjusted successfully');
    } catch (error) {
      console.error('Error in adjustTax controller:', error);

      if (error instanceof NotFoundException) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }

      if (error instanceof BadRequestException) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }

      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to adjust tax');
    }
  }

  /**
   * GET /admin/v2/:location/invoices/:id/available-customers
   * Fetch list of available customers for assignment to invoice
   * 
   * Query params:
   *   - page: number (default: 1)
   *   - limit: number (default: 20)
   *   - search: string (optional, search by name, email, or student)
   *   - showAll: boolean (default: false, if true shows all customers, if false shows only owing)
   */
  @Get(':id/available-customers')
  @Roles(RolesEnum.BACKEND_USER)
  async getAvailableCustomersForInvoice(
    @LocationId() locationId: number,
    @Param('location') locationSlug: string,
    @Param('id') invoiceId: number,
    @Query(ValidationPipe) query: AvailableCustomersRequestDto,
  ): Promise<any> {
    try {
      const result = await this.invoiceDetailService.getAvailableCustomers(
        locationId,
        locationSlug,
        invoiceId,
        query,
      );

      return ResponseHelper.success(result, 'Available customers retrieved successfully');
    } catch (error) {
      console.error('Error in getAvailableCustomersForInvoice controller:', error);

      if (error instanceof NotFoundException) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }

      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to retrieve available customers');
    }
  }

  /**
   * PUT /admin/v2/:location/invoices/:id/customer
   * Assign an existing customer to an invoice
   * Also updates all related payments to point to the new customer
   * 
   * Body:
   *   - customerId: number (required)
   */
  @Put(':id/customer')
  @Roles(RolesEnum.BACKEND_USER)
  async assignCustomerToInvoice(
    @LocationId() locationId: number,
    @Param('location') locationSlug: string,
    @Param('id') invoiceId: number,
    @Body(ValidationPipe) assignData: AssignCustomerToInvoiceDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<any> {
    try {
      const result = await this.invoiceDetailEditService.assignCustomerToInvoice(
        locationId,
        locationSlug,
        invoiceId,
        assignData,
        currentUser.id,
      );

      return ResponseHelper.success(result, 'Customer assigned to invoice successfully');
    } catch (error) {
      console.error('Error in assignCustomerToInvoice controller:', error);

      if (error instanceof NotFoundException) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }

      if (error instanceof BadRequestException) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }

      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to assign customer to invoice');
    }
  }
  
  /**
   * Create invoice message
   * Only allowed when no message exists yet.
   */
  @Post('message/:id')
  @Roles(RolesEnum.BACKEND_USER)
  async createInvoiceMessage(
    @LocationId() locationId: number,
    @Param('location') locationSlug: string,
    @Param('id') invoiceId: number,
    @Body(ValidationPipe) requestDto: CreateInvoiceMessageRequestDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<any> {
    try {
      const result = await this.invoiceDetailEditService.createInvoiceMessage(
        locationId,
        locationSlug,
        invoiceId,
        requestDto,
        currentUser.id,
      );

      return ResponseHelper.success(result, 'Invoice message created successfully');
    } catch (error) {
      console.error('Error in createInvoiceMessage controller:', error);

      if (error instanceof NotFoundException) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      if (error instanceof BadRequestException) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }

      return ResponseHelper.error(
        'INTERNAL_SERVER_ERROR',
        'Failed to create invoice message',
      );
    }
  }

  /**
   * Update invoice message (edit existing — pencil icon)
   * Only allowed when a message already exists.
   * PHP equivalent: actionNote($id) → $model->load(post()) && $model->save()
   */
  @Put('message/:id')
  @Roles(RolesEnum.BACKEND_USER)
  async updateInvoiceMessage(
    @LocationId() locationId: number,
    @Param('location') locationSlug: string,
    @Param('id') invoiceId: number,
    @Body(ValidationPipe) requestDto: CreateInvoiceMessageRequestDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<any> {
    try {
      const result = await this.invoiceDetailEditService.updateInvoiceMessage(
        locationId,
        locationSlug,
        invoiceId,
        requestDto,
        currentUser.id,
      );

      return ResponseHelper.success(result, 'Invoice message updated successfully');
    } catch (error) {
      console.error('Error in updateInvoiceMessage controller:', error);

      if (error instanceof NotFoundException) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      if (error instanceof BadRequestException) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }

      return ResponseHelper.error(
        'INTERNAL_SERVER_ERROR',
        'Failed to update invoice message',
      );
    }
  }
}

