import {
  Controller,
  Delete,
  NotFoundException,
  Param,
  ParseIntPipe,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { LocationResolveGuard } from '../../shared/guards/location.guard';
import { ResponseHelper } from '../../shared/helpers/response.helper';
import { DeleteRecurringPaymentService } from '../services/delete-recurring-payment.service';



@Controller('admin/v2/:location')
@UseGuards(AuthGuard, RolesGuard, LocationResolveGuard)
export class DeleteRecurringPaymentController {
  constructor(
    private readonly deleteRecurringPaymentService: DeleteRecurringPaymentService,
  ) {}

  @Delete('recurring-payments/:id')
  @Roles(RolesEnum.BACKEND_USER)
  async delete(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any,
  ) {
    try {
      // Get the user ID from the authenticated request
      const userId = req.user?.id;

      if (!userId) {
        return ResponseHelper.errors.UNAUTHORIZED('User not authenticated');
      }

      // Execute the delete operation
      const result = await this.deleteRecurringPaymentService.delete(id, userId);

      return ResponseHelper.success(
        result,
        'Recurring payment deleted successfully',
      );
    } catch (error) {
      // Handle NotFoundException
      if (error instanceof NotFoundException) {
        return ResponseHelper.errors.NOT_FOUND('Recurring payment');
      }

      // Handle all other errors
      console.error('Delete recurring payment error:', error);
      return ResponseHelper.errors.INTERNAL_ERROR(
        error.message || 'Failed to delete recurring payment',
      );
    }
  }
}
