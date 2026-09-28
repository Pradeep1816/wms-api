import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../user/entities/user.entity';
import { RbacAuthAssignment } from '../../auth/entities/rbac-auth-assignment.entity';
import { RolesEnum } from '../../auth/enums/roles.enum';


@Injectable()
export class TimelineCreatedUsersRepository {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(RbacAuthAssignment)
    private readonly rbacAssignmentRepository: Repository<RbacAuthAssignment>,
  ) {}

  
  async getBotUserId(): Promise<number | null> {
    const assignment = await this.rbacAssignmentRepository.findOne({
      where: { item_name: RolesEnum.BOT },
      select: ['user_id'],
    });
    return assignment?.user_id != null ? Number(assignment.user_id) : null;
  }

 
  async findCreatedUsers(
    locationId: number,
    loggedUserRole: string,
    botUserId: number | null,
  ): Promise<{ id: number; publicIdentity: string }[]> {
    const qb = this.userRepository
      .createQueryBuilder('user')
      .leftJoin('user.profile', 'up')
      .leftJoin('user.contacts', 'contact', 'contact.isDeleted = 0')
      .leftJoin('contact.emails', 'ue', 'ue.isDeleted = 0')
      .leftJoin('location_walkin_customer', 'lwc', 'lwc.customerId = user.id')
      .innerJoin('rbac_auth_assignment', 'raa', 'raa.user_id = CAST(user.id AS CHAR)')
      .where('user.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('lwc.id IS NULL'); // excludeWalkin: not in location_walkin_customer

    // Normalize role to lowercase (DB stores owner, administrator, staffmember)
    const role = (loggedUserRole || '').toLowerCase();

    // backendUsers: role IN (owner, administrator, staffmember)
    if (role === RolesEnum.ADMINISTRATOR || role === RolesEnum.OWNER) {
      qb.andWhere('raa.item_name IN (:...roles)', {
        roles: [RolesEnum.OWNER, RolesEnum.ADMINISTRATOR, RolesEnum.STAFFMEMBER],
      });
    }

    if (role === RolesEnum.ADMINISTRATOR) {
      // adminWithLocation: (role = administrator) OR (user has this location);
      qb.leftJoin('user_location', 'ul', 'ul.user_id = user.id AND ul.location_id = :locationId', {
        locationId,
      });
      qb.andWhere(
        '(raa.item_name = :adminRole OR ul.location_id = :locationId2)',
        { adminRole: RolesEnum.ADMINISTRATOR, locationId2: locationId },
      );
    } else if (role === RolesEnum.OWNER) {
      qb.innerJoin('user_location', 'ul', 'ul.user_id = user.id AND ul.location_id = :locationId', {
        locationId,
      });
    } else {
      // staff or other: staffs()->location(locationId);
      qb.andWhere('raa.item_name = :staffRole', { staffRole: RolesEnum.STAFFMEMBER });
      qb.innerJoin('user_location', 'ul', 'ul.user_id = user.id AND ul.location_id = :locationId', {
        locationId,
      });
    }

    if (botUserId != null) {
      qb.orWhere('user.id = :botUserId', { botUserId });
    }

    qb.select('user.id')
      .addSelect('up.firstname', 'firstName')
      .addSelect('up.lastname', 'lastName')
      .addSelect('user.username')
      .addSelect('ue.email');
    qb.orderBy('up.firstname', 'ASC');

    const rows = await qb.getRawMany();
    const list: { id: number; publicIdentity: string }[] = [];
    const seen = new Set<number>();

    for (const r of rows) {
      const id = Number((r as any).user_id ?? (r as any).userId ?? (r as any).user_id ?? (r as any).id);
      if (id && !seen.has(id)) {
        seen.add(id);
        const firstName = (r as any).firstName ?? (r as any).up_firstname ?? '';
        const lastName = (r as any).lastName ?? (r as any).up_lastname ?? '';
        const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
        const publicIdentity =
          fullName ||
          (r as any).user_username ||
          (r as any).username ||
          (r as any).ue_email ||
          (r as any).email ||
          String(id);
        list.push({ id, publicIdentity });
      }
    }

    // Ensure bot is included 
    if (botUserId != null && !seen.has(botUserId)) {
      const bot = await this.userRepository.findOne({
        where: { id: botUserId },
        relations: ['profile', 'contacts', 'contacts.emails'],
      });
      const firstName = bot?.profile?.firstname || '';
      const lastName = bot?.profile?.lastname || '';
      const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
      const email = bot?.contacts?.[0]?.emails?.[0]?.email || '';
      const name = fullName || bot?.username || email || `User ${botUserId}`;
      list.push({ id: botUserId, publicIdentity: name });
    }

    return list;
  }
}
