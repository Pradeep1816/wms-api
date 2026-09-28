import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../user/entities/user.entity';
import { TeacherListDto } from '../dto/teacher-list.dto';
import { TeachersByProgramDto } from '../dto/teacher-by-program-response.dto';

@Injectable()
export class TeacherListRepository {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  
  /**
   * Get teachers by location and programId (id and name only)
   */
  async findTeachersByLocationAndProgram(
    locationId: number,
    programId: number,
  ): Promise<User[]> {
    try {
      const teachers = await this.userRepository
        .createQueryBuilder('user')
        .leftJoinAndSelect('user.profile', 'profile')
        .leftJoinAndSelect('user.userLocation', 'userLocation')
        .innerJoin('rbac_auth_assignment', 'raa', 'raa.user_id = CAST(user.id AS CHAR)')
        .innerJoin('qualification', 'q', 'q.teacher_id = user.id AND q.program_id = :programId AND q.isDeleted = 0', { programId })
        .where('user.isDeleted = :isDeleted', { isDeleted: false })
        .andWhere('user.status = :status', { status: 2 }) // STATUS_ACTIVE
        .andWhere('raa.item_name = :role', { role: 'teacher' })
        .andWhere('userLocation.locationId = :locationId', { locationId })
        .orderBy('profile.firstname', 'ASC')
        .addOrderBy('profile.lastname', 'ASC')
        .getMany();

      return teachers;
    } catch (error) {
      console.error('Error in TeacherListRepository.findTeachersByLocationAndProgram:', error);
      throw new InternalServerErrorException(`Failed to fetch teachers for location ${locationId} and program ${programId}: ${error.message}`);
    }
  }
  
}

