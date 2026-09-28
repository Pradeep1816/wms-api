import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { LocationAvailability } from '../../entities/location-availability.entity';

/**
 * Step 3: Create default availability (operation + schedule).
 * For each day 1–7 (Mon–Sun), insert 2 rows: type 1 (operation), type 2 (schedule). Total 14 rows.
 */
@Injectable()
export class LocationCreateAvailabilityRepository {
  constructor(
    @InjectRepository(LocationAvailability)
    private readonly locationAvailabilityRepository: Repository<LocationAvailability>,
  ) {}

  async insertDefaultAvailability(
    locationId: number,
    manager?: EntityManager,
  ): Promise<LocationAvailability[]> {
    const repo = manager ? manager.getRepository(LocationAvailability) : this.locationAvailabilityRepository;
    const fromTime = LocationAvailability.DEFAULT_FROM_TIME;
    const toTime = LocationAvailability.DEFAULT_TO_TIME;
    const typeOperation = LocationAvailability.TYPE_OPERATION_TIME;
    const typeSchedule = LocationAvailability.TYPE_SCHEDULE_TIME;
    const isDeleted = false;

    const rows: Partial<LocationAvailability>[] = [];
    for (let day = 1; day <= 7; day++) {
      rows.push({ locationId, day, type: typeOperation, fromTime, toTime, isDeleted });
      rows.push({ locationId, day, type: typeSchedule, fromTime, toTime, isDeleted });
    }
    const entities = rows.map((row) => repo.create(row));
    return repo.save(entities);
  }
}
