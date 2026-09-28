import { Controller, Get, Param, Query, UseGuards, ValidationPipe, NotFoundException, BadRequestException } from '@nestjs/common';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { AuthService, type AuthenticatedUser } from '../../auth/services/auth.service';
import { ResponseHelper } from '../../shared/helpers/response.helper';
import { LocationResolveGuard } from '../../shared/guards/location.guard';
import { UserInvoicedLessonsService } from '../services/user-invoiced-lessons.service';
import { UserInvoicedLessonsRequestDto } from '../dto/user-invoiced-lessons-request.dto';
import { getPreviousWeekMonday, getPreviousWeekSaturday } from '../utils/date-defaults.helper';
import { LocationId } from 'src/shared/decorators/location-id.decorator';

@Controller('user/v2/:location/user-invoice')
@UseGuards(AuthGuard, RolesGuard, LocationResolveGuard)
export class UserInvoicedLessonsController {
  constructor(
    private readonly userInvoicedLessonsService: UserInvoicedLessonsService,
    private readonly authService: AuthService,
  ) {}

  @Get('invoiced-lessons')
  @Roles(RolesEnum.TEACHER, RolesEnum.CUSTOMER)
  async getMyInvoicedLessons(
    @LocationId() locationId: number,
    @Param('location') locationSlug: string,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Query(ValidationPipe) query: UserInvoicedLessonsRequestDto,
  ) {
    try {
      const portalUserId = await this.authService.resolvePortalUserId(
        currentUser.id,
        locationId,
      );

      if (!portalUserId) {
        return ResponseHelper.error(
          'NOT_FOUND',
          `User with ID ${currentUser.id} not found in location ${locationSlug}`,
        );
      }

      // Apply default date range if not provided (previous week Monday to Saturday)
      const startDate = query.startDate || getPreviousWeekMonday();
      const endDate = query.endDate || getPreviousWeekSaturday();

      const invoicedLessons =
        await this.userInvoicedLessonsService.getUserInvoicedLessons(
          locationId,
          portalUserId,
          startDate,
          endDate,
          query.summaryOnly,
        );

      return ResponseHelper.success(
        invoicedLessons,
        'Invoiced lessons retrieved successfully',
      );
    } catch (error) {
      console.error('Error in getMyInvoicedLessons controller:', error);

      if (error instanceof NotFoundException) {
        return ResponseHelper.errors.NOT_FOUND(error.message);
      }

      if (error instanceof BadRequestException) {
        return ResponseHelper.errors.BAD_REQUEST(error.message);
      }

      return ResponseHelper.errors.INTERNAL_ERROR(
        'Failed to retrieve your invoiced lessons',
      );
    }
  }
}
