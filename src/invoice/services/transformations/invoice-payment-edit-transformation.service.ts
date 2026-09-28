import { Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { UpdateInvoicePaymentResponseDto } from '../../dto/update-invoice-payment-request.dto';

@Injectable()
export class InvoicePaymentEditTransformationService {
    transformUpdateResponse(): UpdateInvoicePaymentResponseDto {
        // Legacy returns only { status: true } - no data payload
        return plainToInstance(
            UpdateInvoicePaymentResponseDto,
            { status: true },
            { excludeExtraneousValues: true },
        );
    }
}
