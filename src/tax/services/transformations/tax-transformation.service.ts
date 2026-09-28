import { Injectable } from '@nestjs/common';
import { TaxCodeResponseDto } from 'src/tax/dto/tax-response.dto';
import { TaxCode } from 'src/tax/entities/tax-code.entity';
import { formatDate } from 'src/utils/date-utils';




@Injectable()
export class TaxCodeTransformationService {
  
  transformRow(taxCode: TaxCode): TaxCodeResponseDto {
    return {
      id: taxCode.id,
      taxName: taxCode.taxType?.name,         
      provinceName: taxCode.province?.name,   
      rate: taxCode.rate,
      startDate:formatDate(taxCode.startDate),   
      code: taxCode.code,
    };
  }

  transformRows(taxCodes: TaxCode[]): TaxCodeResponseDto[] {
    return taxCodes.map(t => this.transformRow(t));
  }
}
