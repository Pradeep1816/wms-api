import {Controller,Get,Query,ValidationPipe,UseGuards,Put,Param,Body,} from '@nestjs/common';
import { EmailRequestDto } from '../dto/email-request.dto';
import { ResponseHelper } from 'src/shared/helpers/response.helper';
import { AuthGuard } from 'src/auth/guards/auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { RolesEnum } from 'src/auth/enums/roles.enum';
import { EmailApiResponseDto } from '../dto/email-response.dto';
import { EmailTemplateService } from '../services/email.service';
import { UpdateEmailTemplateRequestDto } from '../dto/update-email-template-request.dto';
import { UpdateEmailTemplateResponseDto } from '../dto/update-email-template-response.dto';
import { EmailTemplateObjectRequestDto } from '../dto/email-template-object-request.dto';
import { EmailTemplateObjectResponseDto } from '../dto/email-template-object-response.dto';

@UseGuards(AuthGuard, RolesGuard)
@Controller('admin/v2')
export class EmailTemplateController {
  constructor(
    private readonly emailTemplateService: EmailTemplateService,
  ) {}

  @Get('email-template')
  @Roles(RolesEnum.ADMINISTRATOR)
  async getEmailTemplates(
   
    @Query(ValidationPipe) query: EmailRequestDto,
  ): Promise<EmailApiResponseDto | any> {
    try {
      const data = await this.emailTemplateService.getEmailTemplates(query);
      return ResponseHelper.success(
        data,
        'Email templates fetched successfully',
      );
    } catch (error) {
      console.error('Error fetching email templates:', error);
      return ResponseHelper.error(
        'INTERNAL_SERVER_ERROR',
        'Failed to retrieve email templates',
      );
    }
  }

  @Get('email-template/objects')
  @Roles(RolesEnum.BACKEND_USER)
  async getEmailTemplateByObject(
    @Query(ValidationPipe) query: EmailTemplateObjectRequestDto,
  ): Promise<EmailTemplateObjectResponseDto | any> {
    try {
      const data = await this.emailTemplateService.getEmailTemplateByObjectId(
        query.objectId,
      );

      return ResponseHelper.success(
        data,
        'Email template fetched successfully',
      );
    } catch (error) {
      console.error('Error fetching email template by object ID:', error);

     return ResponseHelper.error(error,
        'Failed to retrieve email template for the specified object',
      );
    }
  }

  @Put('email-template/:id')
  @Roles(RolesEnum.ADMINISTRATOR)
  async updateEmailTemplate(
    @Param('id') id: number,
    @Body(ValidationPipe) updateDto: UpdateEmailTemplateRequestDto,
  ): Promise<UpdateEmailTemplateResponseDto | any> {
    try {
      const result = await this.emailTemplateService.updateEmailTemplate(
        id,
        updateDto,
      );

      return ResponseHelper.success(
        result,
        'Email template updated successfully',
      );
    } catch (error) {
      console.error('Error in updateEmailTemplate controller:', error);

      if (error.message?.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }

      if (
        error.message?.includes('validation') ||
        error.message?.includes('Invalid') ||
        error.message?.includes('cannot be blank')
      ) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }

      return ResponseHelper.error(
        'INTERNAL_SERVER_ERROR',
        'Failed to update email template',
      );
    }
  }
}
