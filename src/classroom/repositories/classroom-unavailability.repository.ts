import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClassroomUnavailability } from '../entities/classroom-unavailability.entity';

@Injectable()
export class ClassroomUnavailabilityRepository {
  constructor(
    @InjectRepository(ClassroomUnavailability)
    private readonly repo: Repository<ClassroomUnavailability>,
  ) { }

  async findByClassroomId(classroomId: number): Promise<ClassroomUnavailability[]> {
    return this.repo.find({
      where: { classroomId },
      order: { id: 'DESC' },
    });
  }

  async findOneByIdAndClassroom(
    id: number,
    classroomId: number,
  ): Promise<any> {
    return this.repo.findOne({
      where: { id, classroomId },
    });
  }

  async create(
    data: Partial<ClassroomUnavailability>,
  ): Promise<ClassroomUnavailability> {
    // create unavailability
    const entity = this.repo.create(data);
    // save unavailability
    return this.repo.save(entity);
  }

  async save(entity: ClassroomUnavailability): Promise<ClassroomUnavailability> {
    // save unavailability
    return this.repo.save(entity);
  }

  // async remove(entity: ClassroomUnavailability): Promise<void> {
  //   await this.repo.remove(entity);
  // }

  /**
   * Hard delete by id and classroomId (single DELETE query, no entity load).
   * Use when you have already validated the record exists.
   */
  async deleteByIdAndClassroom(
    id: number,
    classroomId: number,
  ): Promise<void> {
    await this.repo.delete({ id, classroomId });
  }
}
