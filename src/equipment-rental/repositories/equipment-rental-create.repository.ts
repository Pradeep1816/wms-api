import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { EquipmentRental } from '../entities/equipment-rental.entity';
import { EquipmentRentalInstrument } from '../entities/equipment-rental-instrument.entity';
import { CreateEquipmentRentalDto, CreateInstrumentDto } from '../dto/create-equipment-rental.dto';
import { getCurrentESTDate } from '../../utils/date-utils';

@Injectable()
export class EquipmentRentalCreateRepository {
  constructor(
    @InjectRepository(EquipmentRental)
    private readonly equipmentRentalRepository: Repository<EquipmentRental>,
  ) {}

  /**
   * Create equipment rental with instruments using transaction
   */
  async createEquipmentRental(
    customerId: number,
    dto: CreateEquipmentRentalDto,
    userId: number,
    returnDate: Date | null,
  ): Promise<{ id: number }> {
    return this.equipmentRentalRepository.manager.transaction(async (manager: EntityManager) => {
      if (manager.queryRunner) {
        manager.queryRunner.data = {
          ...(manager.queryRunner.data ?? {}),
          currentUserId: userId,
        };
      }
      const { instruments, subTotal, ...rentalData } = dto;

       // Create new equipment rental object
      // Use EST timezone for created/updated dates to match legacy system behavior
      const now = getCurrentESTDate();
      const newEquipmentRental ={
        customerId,
        studentId: rentalData.studentId,
        startDate: new Date(rentalData.startDate),
        returnDate: returnDate,
        duration: rentalData.duration ?? null,
        isOnGoing: rentalData.isOnGoing ?? false,
        securityDeposit: rentalData.securityDeposit ?? false,
        tenderType: rentalData.tenderType ?? null,
        depositAmount: rentalData.depositAmount ?? null,
        hst: rentalData.hst,
        total: rentalData.total,
        isDeleted: false,
        isReturned: false,
        createdOn: now,
        updatedOn: now,
        createdByUserId: userId,
        updatedByUserId: userId,
      }
      // Create rental entity using query builder for proper null handling
      const rentalInsertResult = await manager
        .createQueryBuilder()
        .insert()
        .into(EquipmentRental)
        .values(newEquipmentRental)
        .execute();

      const savedRentalId = rentalInsertResult.identifiers[0].id as number;

      // Create instrument records
      if (instruments.length > 0) {
        await manager
          .createQueryBuilder()
          .insert()
          .into(EquipmentRentalInstrument)
          .values(
            instruments.map((inst: CreateInstrumentDto) => ({
              equipmentRentalsId: savedRentalId,
              instrument: inst.instrumentId,
              value: inst.value?.toString() || '',
              asset: inst.asset || '',
            })),
          )
          .execute();
      }

      return { id: savedRentalId };
    });
  }
}
