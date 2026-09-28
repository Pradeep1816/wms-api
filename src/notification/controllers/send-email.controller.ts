import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { RolesEnum } from 'src/auth/enums/roles.enum';
import { AuthGuard } from 'src/auth/guards/auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import type { AuthenticatedUser } from 'src/auth/services/auth.service';
import { LocationId } from 'src/shared/decorators/location-id.decorator';
import { LocationResolveGuard } from 'src/shared/guards/location.guard';
import { ResponseHelper } from 'src/shared/helpers/response.helper';
import { SendEmailRequestDto } from '../dto/send-email-request.dto';
import { EmailSendService } from '../services/send-email.service';

@Controller('admin/v2/:location/email')
@UseGuards(AuthGuard, RolesGuard, LocationResolveGuard)
export class EmailSendController {
  constructor(private readonly emailSendService: EmailSendService) {}

  @Post('send')
  @HttpCode(HttpStatus.OK)
  @Roles(RolesEnum.BACKEND_USER)
  async sendEmail(
    @LocationId() locationId: number,
   @Param('location') locationSlug: string,
    @Body() rawBody: Record<string, unknown>,
    @Query() rawQuery: Record<string, unknown>,
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<any> {
    try {
      const payload = this.normalizePayload(rawBody, rawQuery);
      const dto = plainToInstance(SendEmailRequestDto, payload);
      const validationErrors = validateSync(dto, {
        whitelist: true,
        forbidNonWhitelisted: false,
      });

      if (validationErrors.length > 0) {
        const firstError = validationErrors[0];
        const message = firstError?.constraints
          ? Object.values(firstError.constraints)[0]
          : 'Invalid email payload';
        throw new BadRequestException(message);
      }

      const result = await this.emailSendService.sendEmail(
        locationSlug,
        locationId,
        dto,      
        currentUser.id,
      );

      return ResponseHelper.success(result, 'Mail has been sent successfully');
    } catch (error) {
      console.error('Error in sendEmail controller:', error);

      if (error instanceof NotFoundException || error.message?.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }

      if (error instanceof BadRequestException || error.message?.includes('required') || error.message?.includes('Invalid')) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }

      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to send email');
    }
  }

  private normalizePayload(
    rawBody: Record<string, unknown>,
    rawQuery: Record<string, unknown>,
  ): Record<string, unknown> {
    const body = rawBody ?? {};
    const legacyBody = this.extractLegacyObject(body);
    const legacyQuery = this.extractLegacyObject(rawQuery);

    return {
      to: (body.to ?? legacyBody.to) as string[] | string,
      subject: (body.subject ?? legacyBody.subject) as string,
      content: (body.content ?? legacyBody.content) as string,
      bcc: (body.bcc ?? legacyBody.bcc) as string[] | string | undefined,
      objectId: this.firstNumber(
        body.objectId,
        rawQuery.objectId,
        legacyBody.objectId,
        legacyQuery.objectId,
      ),
      userId: this.firstNumber(
        body.userId,
        rawQuery.userId,
        legacyBody.userId,
        legacyQuery.userId,
      ),
      lessonId: this.firstNumber(
        body.lessonId,
        rawQuery.lessonId,
        legacyBody.lessonId,
        legacyQuery.lessonId,
      ),
      invoiceId: this.firstNumber(
        body.invoiceId,
        rawQuery.invoiceId,
        legacyBody.invoiceId,
        legacyQuery.invoiceId,
      ),
      paymentId: this.firstNumber(
        body.paymentId,
        rawQuery.paymentId,
        legacyBody.paymentId,
        legacyQuery.paymentId,
      ),
      paymentRequestId: this.firstNumber(
        body.paymentRequestId,
        rawQuery.paymentRequestId,
        legacyBody.paymentRequestId,
        legacyQuery.paymentRequestId,
      ),
    };
  }

  private extractLegacyObject(source: Record<string, unknown>): Record<string, unknown> {
    const nested = source?.EmailForm;
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      return nested as Record<string, unknown>;
    }

    return {
      objectId: source['EmailForm[objectId]'],
      userId: source['EmailForm[userId]'],
      lessonId: source['EmailForm[lessonId]'],
      invoiceId: source['EmailForm[invoiceId]'],
      paymentId: source['EmailForm[paymentId]'],
      paymentRequestId: source['EmailForm[paymentRequestId]'],
      to: source['EmailForm[to]'],
      subject: source['EmailForm[subject]'],
      content: source['EmailForm[content]'],
      bcc: source['EmailForm[bcc]'],
    };
  }

  private firstNumber(...values: unknown[]): number | undefined {
    for (const value of values) {
      if (value === undefined || value === null || value === '') {
        continue;
      }

      const parsed = Number(value);
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }

    return undefined;
  }
}
