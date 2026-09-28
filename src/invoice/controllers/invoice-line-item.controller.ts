import { Controller, Put, Param, Body, UseGuards, NotFoundException, BadRequestException, ValidationPipe, Delete, Post, Get, Query, ParseArrayPipe } from '@nestjs/common';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { LocationResolveGuard } from '../../shared/guards/location.guard';
import { LocationId } from '../../shared/decorators/location-id.decorator';
import { ResponseHelper } from '../../shared/helpers/response.helper';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../auth/services/auth.service';
import { InvoiceLineItemUpdateService } from '../services/invoice-line-item-update.service';
import { UpdateLineItemRequestDto } from '../dto/update-invoice-line-item-request.dto';
import { InvoiceLineItemDeleteService } from '../services/invoice-line-item-delete.service';
import { CreateLineItemRequestDto } from '../dto/create-invoice-line-item-request.dto';
import { InvoiceLineItemCreateService } from '../services/invoice-line-item-create.service';
import { InvoiceLineItemDiscountService } from '../services/invoice-line-item-discount.service';
import { EditInvoiceLineItemDiscountDto } from '../dto/invoice-line-item-discount-request.dto';
import { EditTaxLineItemRequestDto } from '../dto/edit-tax-line-item-request.dto';
import { InvoiceLineItemEditTaxService } from '../services/invoice-line-item-edit-tax.service';
import { ShowInvoiceLineItemRequestDto } from '../dto/show-invoice-line-item-request.dto';
import { InvoiceLineItemShowService } from '../services/invoice-line-item-show.service';
import { EditTaxLineItemQueryDto } from '../dto/edit-tax-line-item-query.dto';

@Controller('admin/v2/:location/invoices')
@UseGuards(AuthGuard, RolesGuard, LocationResolveGuard)
export class InvoiceLineItemController {
    constructor(
        private readonly invoiceLineItemUpdateService: InvoiceLineItemUpdateService,
        private readonly invoiceLineItemDeleteService: InvoiceLineItemDeleteService,
        private readonly invoiceLineItemCreateService: InvoiceLineItemCreateService,
        private readonly invoiceLineItemDiscountService: InvoiceLineItemDiscountService,
        private readonly invoiceLineItemEditTaxService: InvoiceLineItemEditTaxService,
        private readonly invoiceLineItemShowService: InvoiceLineItemShowService,
    ) { }

    // Get discount values for line items. Returns common values or null if differ. Must be declared before GET 'line-items/:Id'
    @Get('line-items/discount')
    @Roles(RolesEnum.BACKEND_USER)
    async getDiscount(
        @LocationId() locationId: number,
        @Query('ids', new ParseArrayPipe({ items: Number })) lineItemIds: number[],
    ): Promise<any> {
        try {
            const result = await this.invoiceLineItemDiscountService.getDiscount(
                lineItemIds,
                locationId,
            );

            return ResponseHelper.success(result.body, 'Discount values retrieved successfully');
        } catch (error) {
            console.error('Error in getDiscount controller:', error);

            if (error instanceof NotFoundException) {
                return ResponseHelper.error('NOT_FOUND', error.message);
            }
            if (error instanceof BadRequestException) {
                return ResponseHelper.error('BAD_REQUEST', error.message);
            }

            return ResponseHelper.error(
                'INTERNAL_SERVER_ERROR',
                'Failed to retrieve discount values',
            );
        }
    }

    // Get edit tax form data (current status, rate, available options). Must be declared before PUT 'line-items/edit-tax'
    @Get('line-items/edit-tax')
    @Roles(RolesEnum.BACKEND_USER)
    async getEditTaxData(
        @LocationId() locationId: number,
        @Param('location') locationSlug: string,
        @Query(new ValidationPipe({ transform: true })) query: EditTaxLineItemQueryDto,
    ): Promise<any> {
        try {
            const result = await this.invoiceLineItemEditTaxService.getEditTaxData(
                locationId,
                locationSlug,
                query.lineItemIds,
            );

            return ResponseHelper.success(result);
        } catch (error) {
            console.error('Error in getEditTaxData controller:', error);

            if (error instanceof NotFoundException) {
                return ResponseHelper.error('NOT_FOUND', error.message);
            }
            if (error instanceof BadRequestException) {
                return ResponseHelper.error('BAD_REQUEST', error.message);
            }

            return ResponseHelper.error(
                'INTERNAL_SERVER_ERROR',
                'Failed to retrieve edit tax data',
            );
        }
    }

    // Update discount values for line items (bulk). Must be declared before PUT 'line-items/:Id'
    @Put('line-items/discount')
    @Roles(RolesEnum.BACKEND_USER)
    async updateDiscount(
        @LocationId() locationId: number,
        @Param('location') locationSlug: string,
        @Body(ValidationPipe) dto: EditInvoiceLineItemDiscountDto,
        @CurrentUser() currentUser: AuthenticatedUser,
    ): Promise<any> {
        try {
            await this.invoiceLineItemDiscountService.updateDiscount(
                dto.lineItemIds,
                locationId,
                locationSlug,
                dto,
                currentUser.id,
            );

            return ResponseHelper.success({ lineItemIds: dto.lineItemIds }, 'Discount updated successfully');
        } catch (error) {
            console.error('Error in updateDiscount controller:', error);

            if (error instanceof NotFoundException) {
                return ResponseHelper.error('NOT_FOUND', error.message);
            }
            if (error instanceof BadRequestException) {
                return ResponseHelper.error('BAD_REQUEST', error.message);
            }

            return ResponseHelper.error(
                'INTERNAL_SERVER_ERROR',
                'Failed to update discount',
            );
        }
    }

    // Edit tax status for line items. Must be declared before PUT 'line-items/:Id'
    @Put('line-items/edit-tax')
    @Roles(RolesEnum.BACKEND_USER)
    async editTax(
        @LocationId() locationId: number,
        @Param('location') locationSlug: string,
        @Body(ValidationPipe) requestDto: EditTaxLineItemRequestDto,
        @CurrentUser() currentUser: AuthenticatedUser,
    ): Promise<any> {
        try {
            const result = await this.invoiceLineItemEditTaxService.editTax(
                locationId,
                locationSlug,
                requestDto,
                currentUser.id,
            );

            return ResponseHelper.success(result, 'Tax successfully updated!');
        } catch (error) {
            console.error('Error in editTax controller:', error);

            if (error instanceof NotFoundException) {
                return ResponseHelper.error('NOT_FOUND', error.message);
            }
            if (error instanceof BadRequestException) {
                return ResponseHelper.error('BAD_REQUEST', error.message);
            }

            return ResponseHelper.error(
                'INTERNAL_SERVER_ERROR',
                'Failed to edit tax',
            );
        }
    }

    // Update line item: description, amount, unit, cost, royaltyFree. Auto-recalculates tax and invoice totals.
    @Put('line-items/:Id')
    @Roles(RolesEnum.BACKEND_USER)
    async updateLineItem(
        @LocationId() locationId: number,
        @Param('location') locationSlug: string,
        @Param('Id') lineItemId: number,
        @Body(ValidationPipe) requestDto: UpdateLineItemRequestDto,
        @CurrentUser() currentUser: AuthenticatedUser,
    ): Promise<any> {
        try {
            const result = await this.invoiceLineItemUpdateService.updateLineItem(
                locationId,
                locationSlug,
                lineItemId,
                requestDto,
                currentUser.id,
            );

            return ResponseHelper.success(result, 'Line item updated successfully');
        } catch (error) {
            console.error('Error in updateLineItem controller:', error);

            if (error instanceof NotFoundException) {
                return ResponseHelper.error('NOT_FOUND', error.message);
            }
            if (error instanceof BadRequestException) {
                return ResponseHelper.error('BAD_REQUEST', error.message);
            }

            return ResponseHelper.error(
                'INTERNAL_SERVER_ERROR',
                'Failed to update line item',
            );
        }
    }

    // Soft delete line item (sets isDeleted = true) and recalculate invoice totals
    @Delete('line-items/:lineItemId')
    @Roles(RolesEnum.BACKEND_USER)
    async deleteLineItem(
        @LocationId() locationId: number,
        @Param('location') locationSlug: string,
        @Param('lineItemId') lineItemId: number,
        @CurrentUser() currentUser: AuthenticatedUser,
    ): Promise<any> {
        try {
            const result = await this.invoiceLineItemDeleteService.deleteLineItem(
                locationId,
                locationSlug,
                lineItemId,
                currentUser.id,
            );

            return ResponseHelper.success(result, 'Line item deleted successfully');
        } catch (error) {
            console.error('Error in deleteLineItem controller:', error);

            if (error instanceof NotFoundException) {
                return ResponseHelper.error('NOT_FOUND', error.message);
            }
            if (error instanceof BadRequestException) {
                return ResponseHelper.error('BAD_REQUEST', error.message);
            }

            return ResponseHelper.error(
                'INTERNAL_SERVER_ERROR',
                'Failed to delete line item',
            );
        }
    }

    // Create line item (add misc item). If exists, increments unit by 1. Auto-recalculates tax and totals.
    @Post(':Id/line-items')
    @Roles(RolesEnum.BACKEND_USER)
    async createLineItem(
        @LocationId() locationId: number,
        @Param('location') locationSlug: string,
        @Param('Id') invoiceId: number,
        @Body(ValidationPipe) requestDto: CreateLineItemRequestDto,
        @CurrentUser() currentUser: AuthenticatedUser,
    ): Promise<any> {
        try {
            const result = await this.invoiceLineItemCreateService.createLineItem(
                locationId,
                locationSlug,
                invoiceId,
                requestDto,
                currentUser.id,
            );

            return ResponseHelper.success(result, 'Line item created successfully');
        } catch (error) {
            console.error('Error in createLineItem controller:', error);

            if (error instanceof NotFoundException) {
                return ResponseHelper.error('NOT_FOUND', error.message);
            }
            if (error instanceof BadRequestException) {
                return ResponseHelper.error('BAD_REQUEST', error.message);
            }

            return ResponseHelper.error(
                'INTERNAL_SERVER_ERROR',
                'Failed to create line item',
            );
        }
    }

    // Get items for Add Line Items modal. Supports filtering on code and description.
    @Get('show-items')
    @Roles(RolesEnum.BACKEND_USER)
    async showItems(
        @LocationId() locationId: number,
        @Query(new ValidationPipe({ transform: true })) query: ShowInvoiceLineItemRequestDto,
    ): Promise<any> {
        try {
            const result = await this.invoiceLineItemShowService.getItems(
                locationId,
                query,
            );

            return ResponseHelper.success(result);
        } catch (error) {
            console.error('Error in showItems controller:', error);

            if (error instanceof BadRequestException) {
                return ResponseHelper.error('BAD_REQUEST', error.message);
            }

            return ResponseHelper.error(
                'INTERNAL_SERVER_ERROR',
                'Failed to retrieve items',
            );
        }
    }
}
