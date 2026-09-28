import { Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import {
  EquipmentRentalPrintContractDto,
  EquipmentRentalPrintCustomerDto,
  EquipmentRentalPrintDataDto,
  EquipmentRentalPrintDetailDto,
  EquipmentRentalPrintInstrumentDto,
  EquipmentRentalPrintLocationDto,
  EquipmentRentalPrintRentalDto,
  EquipmentRentalPrintStudentDto,
  EquipmentRentalPrintTotalsDto,
} from '../../dto/equipment-rental-print-response.dto';
import { RentedInstrumentDto } from '../../dto/equipment-rental-modal-response.dto';

interface EquipmentRentalPrintTransformInput {
  location: Partial<EquipmentRentalPrintLocationDto>;
  customer: Partial<EquipmentRentalPrintCustomerDto>;
  student: Partial<EquipmentRentalPrintStudentDto>;
  rental: Partial<EquipmentRentalPrintRentalDto>;
  instruments: RentedInstrumentDto[];
  totals: Partial<EquipmentRentalPrintTotalsDto>;
  contract: Partial<EquipmentRentalPrintContractDto>;
}

@Injectable()
export class EquipmentRentalPrintTransformationService {
  transformToPrintData(input: EquipmentRentalPrintTransformInput): EquipmentRentalPrintDataDto {
    const body = this.transformBody(input);

    return plainToInstance(
      EquipmentRentalPrintDataDto,
      { body },
      { excludeExtraneousValues: true },
    );
  }

  private transformBody(input: EquipmentRentalPrintTransformInput): EquipmentRentalPrintDetailDto {
    return plainToInstance(
      EquipmentRentalPrintDetailDto,
      {
        location: this.transformLocation(input.location),
        customer: this.transformCustomer(input.customer),
        student: this.transformStudent(input.student),
        rental: this.transformRental(input.rental),
        instruments: this.transformInstruments(input.instruments),
        totals: this.transformTotals(input.totals),
        contract: this.transformContract(input.contract),
      },
      { excludeExtraneousValues: true },
    );
  }

  private transformLocation(location: Partial<EquipmentRentalPrintLocationDto>): EquipmentRentalPrintLocationDto {
    return plainToInstance(
      EquipmentRentalPrintLocationDto,
      {
        name: location?.name || '',
        address: location?.address || '',
        province: location?.province || '',
        phoneNumber: location?.phoneNumber || '',
      },
      { excludeExtraneousValues: true },
    );
  }

  private transformCustomer(customer: Partial<EquipmentRentalPrintCustomerDto>): EquipmentRentalPrintCustomerDto {
    return plainToInstance(
      EquipmentRentalPrintCustomerDto,
      {
        name: customer?.name || '',
        address: customer?.address || '',
        city: customer?.city || '',
        postalCode: customer?.postalCode || '',
        homePhone: customer?.homePhone || '',
        workPhone: customer?.workPhone || '',
        otherPhone: customer?.otherPhone || '',
        email: customer?.email || '',
      },
      { excludeExtraneousValues: true },
    );
  }

  private transformStudent(student: Partial<EquipmentRentalPrintStudentDto>): EquipmentRentalPrintStudentDto {
    return plainToInstance(
      EquipmentRentalPrintStudentDto,
      {
        firstName: student?.firstName || '',
        lastName: student?.lastName || '',
      },
      { excludeExtraneousValues: true },
    );
  }

  private transformRental(rental: Partial<EquipmentRentalPrintRentalDto>): EquipmentRentalPrintRentalDto {
    return plainToInstance(
      EquipmentRentalPrintRentalDto,
      {
        startDate: rental?.startDate || '',
        returnDate: rental?.returnDate || '',
        durationLabel: rental?.durationLabel || '',
      },
      { excludeExtraneousValues: true },
    );
  }

  private transformInstruments(instruments: RentedInstrumentDto[]): EquipmentRentalPrintInstrumentDto[] {
    if (!Array.isArray(instruments) || instruments.length === 0) {
      return [];
    }

    return instruments.map((instrument) =>
      plainToInstance(
        EquipmentRentalPrintInstrumentDto,
        {
          instrument: instrument?.instrument || '',
          retailValue: instrument?.retailValue || '',
          assetTag: instrument?.assetTag || '',
          monthlyRate: instrument?.monthlyRate || '0.00',
          numberOfMonths: instrument?.numberOfMonths || '0',
          total: instrument?.total || '0.00',
        },
        { excludeExtraneousValues: true },
      ),
    );
  }

  private transformTotals(totals: Partial<EquipmentRentalPrintTotalsDto>): EquipmentRentalPrintTotalsDto {
    return plainToInstance(
      EquipmentRentalPrintTotalsDto,
      {
        SubTotal: totals?.SubTotal || '$0.00',
        Tax: totals?.Tax || '$0.00',
        Total: totals?.Total || '$0.00',
      },
      { excludeExtraneousValues: true },
    );
  }

  private transformContract(contract: Partial<EquipmentRentalPrintContractDto>): EquipmentRentalPrintContractDto {
    return plainToInstance(
      EquipmentRentalPrintContractDto,
      {
        agreementText: contract?.agreementText || '',
        footerLeft: contract?.footerLeft || '',
        footerRight: contract?.footerRight || '',
      },
      { excludeExtraneousValues: true },
    );
  }
}
