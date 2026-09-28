import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { UserProfile } from './entities/user-profile.entity';
import { UserContact } from './entities/user-contact.entity';
import { UserEmail } from './entities/user-email.entity';
import { UserPhone } from './entities/user-phone.entity';
import { UserAddress } from './entities/user-address.entity';
import { UserLocation } from './entities/user-location.entity';
import { Label } from './entities/label.entity';
import { UserService } from './services/user.service';
import { UserController } from './controllers/user.controller';
import { UserPortalController } from './controllers/user-portal.controller';
import { UserListController } from './controllers/user-list.controller';
import { UserInfoController } from './controllers/user-info.controller';
import { UserCreateController } from './controllers/user-create.controller';
import { UserDeleteController } from './controllers/user-delete.controller';
import { UserImportController } from './controllers/user-import.controller';
import { UserListRepository } from './repositories/user-list.repository';
import { UserDeleteRepository } from './repositories/user-delete.repository';
import { UsersInfoProfileRepository } from './repositories/users-info-profile.repository';
import { UsersInfoEmailRepository } from './repositories/users-info-email.repository';
import { UsersInfoPhoneRepository } from './repositories/users-info-phone.repository';
import { UsersInfoAddressRepository } from './repositories/users-info-address.repository';
import { UserListTransformationService } from './services/transformations/user-list-transformation.service';
import { UserInfoTransformationService } from './services/transformations/user-info-transformation.service';
import { UserInfoService } from './services/user-info.service';
import { UserCreateService } from './services/user-create.service';
import { UserImportService } from './services/user-import.service';
import { UserCreateRepository } from './repositories/user-create.repository';
import { UserImportRepository } from './repositories/user-import.repository';
import { AuthModule } from '../auth/auth.module';
import { LocationModule } from '../location/location.module';
import { CustomerValidationModule } from '../shared/customer-validation.module';
import { StudentModule } from '../student/student.module';
import { RbacAuthAssignment } from '../auth/entities/rbac-auth-assignment.entity';
import { RbacAuthItem } from '../auth/entities/rbac-auth-item.entity';
import { RbacAuthItemChild } from '../auth/entities/rbac-auth-item-child.entity';
import { City } from '../location/entities/city.entity';
import { Province } from '../location/entities/province.entity';
import { Country } from '../location/entities/country.entity';
import { CustomerAccount } from '../customer/entities/customer-account.entity';
import { CustomerEmailNotification } from '../customer/entities/customer-email-notification.entity';
import { NotificationEmailType } from '../customer/entities/notification-email-type.entity';
import { ReleaseNotes } from '../release-notes/entities/release-notes.entity';
import { ReleaseNotesRead } from '../release-notes/entities/release-notes-read.entity';
import { Student } from '../student/entities/student.entity';
import { Payment } from '../payment/entities/payment.entity';
import { Course } from '../course/entities/course.entity';
import { Qualification } from '../qualification/entities/qualification.entity';
import { StudentCsv } from '../student/entities/student-csv.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User, 
      UserProfile, 
      UserContact, 
      UserEmail,
      UserPhone,
      UserAddress,
      UserLocation,
      Label,
      RbacAuthAssignment, 
      RbacAuthItem,
      RbacAuthItemChild,
      City,
      Province,
      Country,
      CustomerAccount,
      CustomerEmailNotification,
      NotificationEmailType,
      ReleaseNotes,
      ReleaseNotesRead,
      Student,
      StudentCsv,
      Payment,
      Course,
      Qualification,
    ]), 
    AuthModule,
    LocationModule,
    CustomerValidationModule,
    StudentModule,
  ],
  controllers: [UserController, UserPortalController, UserListController, UserInfoController, UserCreateController, UserDeleteController, UserImportController],
  providers: [
    UserService,
    UserListRepository,
    UserDeleteRepository,
    UsersInfoProfileRepository,
    UsersInfoEmailRepository,
    UsersInfoPhoneRepository,
    UsersInfoAddressRepository,
    UserListTransformationService,
    UserInfoTransformationService,
    UserInfoService,
    UserCreateService,
    UserCreateRepository,
    UserImportService,
    UserImportRepository,
  ],
  exports: [UserService],
})
export class UserModule {}
