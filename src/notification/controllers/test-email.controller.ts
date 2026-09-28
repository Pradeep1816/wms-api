import {Controller,Get,Query,UseGuards,ValidationPipe,Put,Param,Body,Req,} from '@nestjs/common';
import { TestEmailService } from '../services/test-email.service';
import { TestEmailRequestDto } from '../dto/test-email-request.dto';
import { ResponseHelper } from 'src/shared/helpers/response.helper';
import { AuthGuard } from 'src/auth/guards/auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { RolesEnum } from 'src/auth/enums/roles.enum';
import { TestEmailResponseDto } from '../dto/test-email-response.dto';
import { UpdateTestEmailRequestDto } from '../dto/update-test-email-request.dto';
import { UpdateTestEmailResponseDto } from '../dto/update-test-email-response.dto';


@UseGuards(AuthGuard, RolesGuard,)
@Controller('admin/v2')
export class TestEmailController {
  constructor(private readonly testEmailService: TestEmailService) {}

  @Get('test-email')
  @Roles(RolesEnum.ADMINISTRATOR)
  async getTestEmails(
    @Query(ValidationPipe) query: TestEmailRequestDto,
  ): Promise<TestEmailResponseDto | any> {
    try {
      const data = await this.testEmailService.getTestEmails(query);

      return ResponseHelper.success(
        data,
        'Test Emails retrieved successfully',
      );
    } catch (error) {
      console.error('Error fetching Test Emails:', error);
      return ResponseHelper.error(
        'INTERNAL_SERVER_ERROR',
        'Failed to retrieve Test Emails',
      );
    }
  }

  @Put('test-email/:id')
  @Roles(RolesEnum.ADMINISTRATOR)
  async updateTestEmail(
    @Req() req: any,
    @Param('id') id: number,
    @Body(ValidationPipe) updateDto: UpdateTestEmailRequestDto,
  ): Promise<UpdateTestEmailResponseDto | any> {
    try {
      const userId = req.user?.id;

      const result = await this.testEmailService.updateTestEmail(
        id,
        updateDto,
        userId,
      );

      return ResponseHelper.success(
        result,
        'Test email updated successfully',
      );
    } catch (error) {
      console.error('Error in updateTestEmail controller:', error);

      if (error.message?.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }

      if (
        error.message?.includes('validation') ||
        error.message?.includes('Invalid')
      ) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }

      return ResponseHelper.error(
        'INTERNAL_SERVER_ERROR',
        'Failed to update test email',
      );
    }
  }
}
