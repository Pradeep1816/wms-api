import { Module } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../user/entities/user.entity';
import { UserProfile } from '../user/entities/user-profile.entity';
import { UserLocation } from '../user/entities/user-location.entity';
import { Location } from '../location/entities/location.entity';
import { RbacAuthAssignment } from './entities/rbac-auth-assignment.entity';
import { RbacAuthItem } from './entities/rbac-auth-item.entity';
import { RbacAuthRule } from './entities/rbac-auth-rule.entity';
import { RbacAuthItemChild } from './entities/rbac-auth-item-child.entity';
import { UserToken } from './entities/user-token.entity';
import { MailerService } from '../shared/services/mailer.service';
import { AuthService } from './services/auth.service';
import { AdminSignInService } from './services/admin-sign-in.service';
import { UserSignInService } from './services/user-sign-in.service';
import { PasswordResetService } from './services/password-reset.service';
import { PermissionService } from './services/permission.service';
import { AuthGuard } from './guards/auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { PermissionController } from './controllers/permission.controller';
import { SignInController } from './controllers/sign-in.controller';
import { UserSignInController } from './controllers/user-sign-in.controller';
import { PermissionRepository } from './repositories/permission.repository';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      UserProfile,
      UserLocation,
      Location,
      RbacAuthAssignment,
      RbacAuthItem,
      RbacAuthRule,
      RbacAuthItemChild,
      UserToken,
    ]),
  ],
  controllers: [PermissionController, SignInController, UserSignInController],
  providers: [
    AuthService,
    AdminSignInService,
    UserSignInService,
    PasswordResetService,
    PermissionService,
    PermissionRepository,
    AuthGuard,
    RolesGuard,
    ThrottlerGuard,
    MailerService,
  ],
  exports: [
    AuthService,
    PermissionService,
    PermissionRepository,
    AuthGuard,
    RolesGuard,
  ],
})
export class AuthModule {}
