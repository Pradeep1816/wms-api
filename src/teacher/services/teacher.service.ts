import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../user/entities/user.entity';
import { UserProfile } from '../../user/entities/user-profile.entity';
import { UserLocation } from '../../user/entities/user-location.entity';
import { RbacAuthAssignment } from '../../auth/entities/rbac-auth-assignment.entity';
import { RbacAuthItem } from '../../auth/entities/rbac-auth-item.entity';
import {
  TeacherListDto,
  TeacherListStatusFilter,
} from '../dto/teacher-list.dto';
import { TeacherListRepository } from '../repositories/teachers-by-program.repository';
import {
  TeacherByProgramResponseDto,
  TeachersByProgramDto,
} from '../dto/teacher-by-program-response.dto';

@Injectable()
export class TeacherService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(UserProfile)
    private readonly userProfileRepository: Repository<UserProfile>,
    @InjectRepository(UserLocation)
    private readonly userLocationRepository: Repository<UserLocation>,
    @InjectRepository(RbacAuthAssignment)
    private readonly assignmentRepository: Repository<RbacAuthAssignment>,
    @InjectRepository(RbacAuthItem)
    private readonly itemRepository: Repository<RbacAuthItem>,
    private readonly teacherListRepository: TeacherListRepository,
  ) {}

  /**
   * Get teachers by location (id and name only)
   * Equivalent to: SELECT user.id, CONCAT(user_profile.firstname, ' ', user_profile.lastname) as name
   * FROM user
   * LEFT JOIN user_location ul ON user.id = ul.user_id
   * INNER JOIN rbac_auth_assignment raa ON raa.user_id = user.id
   * INNER JOIN user_profile ON user_profile.user_id = user.id
   * WHERE user.isDeleted=FALSE AND user.status=2 AND raa.item_name='teacher' AND ul.location_id=?
   * ORDER BY user_profile.firstname, user_profile.lastname
   */
  async findTeachersByLocation(
    locationId: number,
    statusFilter: TeacherListStatusFilter = 'active',
  ): Promise<TeacherListDto[]> {
    try {
      const query = this.userRepository
        .createQueryBuilder('user')
        .leftJoin('user_location', 'ul', 'user.id = ul.user_id')
        .innerJoin('rbac_auth_assignment', 'raa', 'raa.user_id = user.id')
        .innerJoin('user_profile', 'up', 'up.user_id = user.id')
        .select([
          'user.id as id',
          "CONCAT(COALESCE(up.firstname, ''), ' ', COALESCE(up.lastname, '')) as name",
          'up.businessName as businessName',
        ])
        .where('user.isDeleted = :isDeleted', { isDeleted: false })
        .andWhere('raa.item_name = :role', { role: 'teacher' })
        .andWhere('ul.location_id = :locationId', { locationId })
        .orderBy('up.firstname', 'ASC')
        .addOrderBy('up.lastname', 'ASC');

      if (statusFilter === 'active') {
        query.andWhere('user.status = :status', {
          status: User.STATUS_ACTIVE,
        });
      } else if (statusFilter === 'inactive') {
        query.andWhere('user.status = :status', {
          status: User.STATUS_NOT_ACTIVE,
        });
      } else {
        query.andWhere('user.status IN (:...statuses)', {
          statuses: [User.STATUS_ACTIVE, User.STATUS_NOT_ACTIVE],
        });
      }

      const teachers = await query.getRawMany<{
        id: string;
        name: string;
        businessName: string | null;
      }>();

      return teachers.map((teacher) => ({
        id: Number.parseInt(teacher.id, 10),
        name: teacher.name.trim() || 'Unknown Teacher',
        businessName: teacher.businessName || null,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to fetch teachers for location ${locationId}: ${message}`,
      );
    }
  }

  // Get teachers by location and program

  async findTeachersByLocationAndProgram(
    locationId: number,
    programId: number,
  ): Promise<TeacherByProgramResponseDto> {
    try {
      const teachers =
        await this.teacherListRepository.findTeachersByLocationAndProgram(
          locationId,
          programId,
        );
      const teacherList = this.transformTeacherListToDto(teachers);
      return {
        body: teacherList,
      };
    } catch (error) {
      console.error(
        'Error in TeacherService.findTeachersByLocationAndProgram:',
        error,
      );
      const message = error instanceof Error ? error.message : String(error);
      throw new InternalServerErrorException(
        `Failed to fetch teachers for location ${locationId} and program ${programId}: ${message}`,
      );
    }
  }

  transformTeacherListToDto(teachers: User[]): TeachersByProgramDto[] {
    return teachers.map((teacher) => ({
      id: teacher.id,
      name: teacher.profile
        ? `${teacher.profile.firstname || ''} ${teacher.profile.lastname || ''}`.trim() ||
          'Unknown Teacher'
        : 'Unknown Teacher',
    }));
  }
}
