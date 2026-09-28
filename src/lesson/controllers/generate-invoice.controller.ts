import {
    BadRequestException,
    Body,
    Controller,
    Param,
    Post,
    Req,
    UseGuards,
    ValidationPipe,
} from '@nestjs/common';
import { PrivateLessonInvoiceService } from '../services/generate-invoice.service';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { LocationResolveGuard } from '../../shared/guards/location.guard';
import { ResponseHelper } from '../../shared/helpers/response.helper';
import { GeneratePrivateInvoiceDto } from '../dto/generate-private-invoice.dto';
import { LocationId } from 'src/shared/decorators/location-id.decorator';

@Controller('admin/v2/:location/lesson')
@UseGuards(AuthGuard, RolesGuard, LocationResolveGuard)
export class GenerateInvoiceController {
    constructor(
        private readonly privateLessonInvoiceService: PrivateLessonInvoiceService,
    ) { }

    @Post('generate-invoice')
    @Roles(RolesEnum.BACKEND_USER)
    async generateInvoice(
        @LocationId() locationId: number,
        @Param('location') locationSlug: string,
        @Body(ValidationPipe) dto: GeneratePrivateInvoiceDto,
        @Req() req: any,
    ) {
        try {
            const loggedInUserId = req.user?.id;
            if (!loggedInUserId) {
                return ResponseHelper.errors.UNAUTHORIZED('User not authenticated');
            }
            const result =
                await this.privateLessonInvoiceService.generateInvoicesForLessons(
                    locationId,
                    dto,
                    loggedInUserId,
                );
            const url = result.invoiceId
                ? `/admin/${locationSlug}/invoices/${result.invoiceId}`
                : undefined;

            return ResponseHelper.success(
                { ...result, url },
                'Invoices generated successfully'
            );
        } catch (error) {
            console.error('Error in generateInvoice controller:', error);
           
            if (error instanceof BadRequestException) {
                return ResponseHelper.error('BAD_REQUEST', error.message);
              }
            
              return ResponseHelper.error(
                'INTERNAL_SERVER_ERROR',
                error.message || 'Failed to generate invoices',
              );
        }
    }
}   
