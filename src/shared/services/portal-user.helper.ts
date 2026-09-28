import { Repository } from 'typeorm';
import { User } from '../../user/entities/user.entity';

async function getPrimaryEmail(
  userRepository: Repository<User>,
  userId: number,
): Promise<string | null> {
  const currentUser = await userRepository.findOne({
    where: { id: userId, isDeleted: false },
    relations: ['contacts', 'contacts.emails'],
  });

  if (!currentUser) {
    return null;
  }

  const primaryContact = currentUser.contacts?.find(
    (contact) => contact.isPrimary && !contact.isDeleted,
  );

  return (
    primaryContact?.emails?.find((email) => !email.isDeleted)?.email ?? null
  );
}

export async function resolvePortalUserIdByLocation(
  userRepository: Repository<User>,
  userId: number,
  locationId: number,
): Promise<number | null> {
  const primaryEmail = await getPrimaryEmail(userRepository, userId);

  if (!primaryEmail) {
    return null;
  }

  const user = await userRepository
    .createQueryBuilder('user')
    .innerJoin(
      'user.contacts',
      'contact',
      'contact.isPrimary = :isPrimary AND contact.isDeleted = :contactDeleted',
      { isPrimary: true, contactDeleted: false },
    )
    .innerJoin('contact.emails', 'email', 'email.isDeleted = :emailDeleted', {
      emailDeleted: false,
    })
    .innerJoin('user.userLocation', 'userLocation')
    .where('user.isDeleted = :userDeleted', { userDeleted: false })
    .andWhere('user.canLogin = :canLogin', { canLogin: true })
    .andWhere('email.email = :email', { email: primaryEmail })
    .andWhere('userLocation.locationId = :locationId', { locationId })
    .orderBy('user.id', 'ASC')
    .getOne();

  return user?.id ?? null;
}

export async function resolveTeacherPortalLocationIds(
  userRepository: Repository<User>,
  userId: number,
): Promise<number[]> {
  const primaryEmail = await getPrimaryEmail(userRepository, userId);

  if (!primaryEmail) {
    return [];
  }

  const users = await userRepository
    .createQueryBuilder('user')
    .innerJoin(
      'user.contacts',
      'contact',
      'contact.isPrimary = :isPrimary AND contact.isDeleted = :contactDeleted',
      { isPrimary: true, contactDeleted: false },
    )
    .innerJoin('contact.emails', 'email', 'email.isDeleted = :emailDeleted', {
      emailDeleted: false,
    })
    .innerJoinAndSelect('user.userLocation', 'userLocation')
    .where('user.isDeleted = :userDeleted', { userDeleted: false })
    .andWhere('user.canLogin = :canLogin', { canLogin: true })
    .andWhere('email.email = :email', { email: primaryEmail })
    .getMany();

  return Array.from(
    new Set(
      users
        .map((user) => user.userLocation?.locationId)
        .filter(
          (locationId): locationId is number =>
            typeof locationId === 'number',
        ),
    ),
  );
}
