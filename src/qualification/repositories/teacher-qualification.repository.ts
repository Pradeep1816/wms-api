import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../user/entities/user.entity';
import { Qualification } from '../entities/qualification.entity';
import { RbacAuthAssignment } from '../../auth/entities/rbac-auth-assignment.entity';

@Injectable()
export class TeacherQualificationRepository {
  constructor(
    @InjectRepository(Qualification)
    private readonly qualificationRepository: Repository<Qualification>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(RbacAuthAssignment)
    private readonly rbacRepository: Repository<RbacAuthAssignment>,
  ) {}

  /**
   * Find all teacher IDs that are eligible to teach a given program at a given location.
   * Mirrors legacy teachers($programId, $locationId) scope.
   */
  async isTeacherEligibleForProgram(
    programId: number,
    locationId: number,
  ): Promise<number[]> {
    const rows = await this.userRepository
      .createQueryBuilder('user')
      .innerJoin('user.userLocation', 'userLocation')
      .innerJoin(
        Qualification,
        'qualification',
        'qualification.teacherId = user.id AND qualification.programId = :programId AND qualification.isDeleted = :qualDeleted',
        { programId, qualDeleted: false },
      )
      .innerJoin(
        RbacAuthAssignment,
        'rbacAuthAssignment',
        'rbacAuthAssignment.user_id = CAST(user.id AS CHAR) AND rbacAuthAssignment.item_name = :teacherRole',
        { teacherRole: 'teacher' },
      )
      .where('userLocation.locationId = :locationId', { locationId })
      .andWhere('user.isDeleted = :isDeleted', { isDeleted: false })
      .getMany();

    return rows.map((u) => u.id);
  }

}