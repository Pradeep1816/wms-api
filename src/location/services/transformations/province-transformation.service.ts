import { Injectable } from '@nestjs/common';
import { ProvinceResponseDto } from 'src/location/dto/province-response.dto';
import { Province } from 'src/location/entities/province.entity';


@Injectable()
export class ProvinceTransformationService {
  
  transformRow(province: Province): ProvinceResponseDto {
    return {
      id: province.id,
      name: province.name,
      country: province.country?.name,
      taxRate: province.taxRate,
    };
  }

  transformRows(provinces: Province[]): ProvinceResponseDto[] {
    return provinces.map(p => this.transformRow(p));
  }
}
