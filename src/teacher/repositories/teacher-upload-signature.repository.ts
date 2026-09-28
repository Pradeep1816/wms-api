import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { User } from '../../user/entities/user.entity';
import { UserProfile } from '../../user/entities/user-profile.entity';

@Injectable()
export class TeacherUploadSignatureRepository {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(UserProfile)
    private readonly userProfileRepository: Repository<UserProfile>,
  ) {}

  findTeacherWithProfile(
    locationId: number,
    teacherId: number,
  ): Promise<User | null> {
    return this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.profile', 'profile')
      .innerJoin(
        'user_location',
        'ul',
        'ul.user_id = user.id AND ul.location_id = :locationId',
        { locationId },
      )
      .innerJoin(
        'rbac_auth_assignment',
        'raa',
        'raa.user_id = CAST(user.id AS CHAR) AND raa.item_name = :role',
        { role: RolesEnum.TEACHER },
      )
      .where('user.id = :teacherId', { teacherId })
      .andWhere('user.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('user.status = :status', { status: User.STATUS_ACTIVE })
      .getOne();
  }

  saveProfile(profile: UserProfile): Promise<UserProfile> {
    return this.userProfileRepository.save(profile);
  }
}
