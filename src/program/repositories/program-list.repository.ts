import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Program } from '../entities/program.entity';
import { ProgramListRequestDto } from '../dto/program-list-request.dto';

@Injectable()
export class ProgramListRepository {
  constructor(
    @InjectRepository(Program)
    private readonly programRepository: Repository<Program>,
  ) {}

  /**
   * Get programs with filtering, sorting, and pagination
   */
  async getPrograms(searchDto: ProgramListRequestDto): Promise<{ programs: Program[]; total: number }> {
    const {
      page = 1,
      limit = 20,
      type,
      name,
      rate,
      showActive = true,
      showInActive = false,
      showAll = false,
    } = searchDto;

    // Support both 'sort'/'order' and 'sortBy'/'sortOrder'
    // Prefer 'sortBy'/'sortOrder' if provided, otherwise use 'sort'/'order'
    const sort = searchDto.sortBy || searchDto.sort || 'name';
    const order = searchDto.sortOrder || searchDto.order || 'ASC';

    const query = this.programRepository
      .createQueryBuilder('program')
      .select(['program.id', 'program.name', 'program.rate', 'program.status', 'program.type'])
      .where('program.isDeleted = :isDeleted', { isDeleted: false });

    // Type filter
    if (type === 'private') {
      query.andWhere('program.type = :type', { type: Program.TYPE_PRIVATE_PROGRAM });
    } else if (type === 'group') {
      query.andWhere('program.type = :type', { type: Program.TYPE_GROUP_PROGRAM });
    }

    // Name filter (LIKE search)
    if (name?.trim()) {
      query.andWhere('program.name LIKE :name', { name: `%${name.trim()}%` });
    }

    // Rate filter (LIKE search)
    if (rate?.trim()) {
      query.andWhere('program.rate LIKE :rate', { rate: `%${rate.trim()}%` });
    }

    // Status filter
    if (!showAll) {
      if (showActive && !showInActive) {
        query.andWhere('program.status = :status', { status: Program.STATUS_ACTIVE });
      } else if (!showActive && showInActive) {
        query.andWhere('program.status = :status', { status: Program.STATUS_INACTIVE });
      } else if (!showActive && !showInActive) {
        // Default: show only active
        query.andWhere('program.status = :status', { status: Program.STATUS_ACTIVE });
      }
    }

    // Sorting
    const sortField = sort === 'rate' ? 'program.rate' : 'program.name';
    query.orderBy(sortField, order === 'DESC' ? 'DESC' : 'ASC');

    // Get total and apply pagination
    const total = await query.getCount();
    const programs = await query.skip((page - 1) * limit).take(limit).getMany();

    return { programs, total };
  }
}
