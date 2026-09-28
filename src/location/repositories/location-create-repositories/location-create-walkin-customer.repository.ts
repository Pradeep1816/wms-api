import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import * as crypto from 'crypto';
import { User } from '../../../user/entities/user.entity';
import { UserProfile } from '../../../user/entities/user-profile.entity';
import { UserLocation } from '../../../user/entities/user-location.entity';
import { RbacAuthAssignment } from '../../../auth/entities/rbac-auth-assignment.entity';
import { LocationWalkinCustomer } from '../../entities/location-walkin-customer.entity';
import { RolesEnum } from '../../../auth/enums/roles.enum';

/**
 * Step 7: Create walk-in customer and link to location.
 * Legacy: Location::addWalkinCustomer() + UserForm::save()
 * Inserts only (5 tables): user, user_profile, rbac_auth_assignment, user_location, location_walkin_customer.
 * Legacy does NOT create: user_contact, user_email, customer_account.
 */
@Injectable()
export class LocationCreateWalkinCustomerRepository {
  constructor() {}

  async insertWalkinCustomer(
    locationId: number,
    createdByUserId: number,
    manager: EntityManager,
  ): Promise<{ userId: number; customerId: number }> {
    const userRepo = manager.getRepository(User);
    const profileRepo = manager.getRepository(UserProfile);
    const assignmentRepo = manager.getRepository(RbacAuthAssignment);
    const userLocRepo = manager.getRepository(UserLocation);
    const walkinRepo = manager.getRepository(LocationWalkinCustomer);

    const authKey = crypto.randomBytes(16).toString('hex');
    const accessToken = crypto.randomBytes(20).toString('hex');
    const now = Math.floor(Date.now() / 1000);

    // Legacy-identical walk-in User: required + optional (nullable) set explicitly
    const user = userRepo.create({
      username: null,
      auth_key: authKey,
      access_token: accessToken,
      login_token: '',
      password_hash: null,
      pin_hash: null,
      oauth_client: null,
      oauth_client_user_id: null,
      status: User.STATUS_NOT_ACTIVE,
      canLogin: true,
      canMerge: false,
      isDeleted: false,
      created_at: now,
      updated_at: now,
      logged_at: null,
    } as unknown as Partial<User>);
    const savedUser = await userRepo.save(user);

    const profile = profileRepo.create({
      userId: savedUser.id,
      firstname: LocationWalkinCustomer.WALKIN_FIRSTNAME,
      lastname: LocationWalkinCustomer.WALKIN_LASTNAME,
    });
    await profileRepo.save(profile);

    const assignment = assignmentRepo.create({
      item_name: RolesEnum.CUSTOMER,
      user_id: savedUser.id.toString(),
      created_at: now,
    });
    await assignmentRepo.save(assignment);

    const userLocation = userLocRepo.create({
      userId: savedUser.id,
      locationId,
    });
    await userLocRepo.save(userLocation);

    const walkin = walkinRepo.create({
      locationId,
      customerId: savedUser.id,
    });
    await walkinRepo.save(walkin);

    return { userId: savedUser.id, customerId: savedUser.id };
  }
}
