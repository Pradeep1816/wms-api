import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { UsersInfoProfileRepository } from '../repositories/users-info-profile.repository';
import { UsersInfoEmailRepository } from '../repositories/users-info-email.repository';
import { UsersInfoPhoneRepository } from '../repositories/users-info-phone.repository';
import { UsersInfoAddressRepository } from '../repositories/users-info-address.repository';
import { LocationService } from '../../location/services/location.service';
import { UserListRepository } from '../repositories/user-list.repository';
import { UserInfoResponseBodyDto } from '../dto/user-info-response.dto';
import { UserInfoTransformationService } from './transformations/user-info-transformation.service';
import { CustomerValidationService as UserValidation } from 'src/shared/services/customer-validation.service';
import { RolesEnum } from 'src/auth/enums/roles.enum';
import { CreateUserInfoDto, UserInfoType } from '../dto/create-user-info.dto';
import { DeleteUserInfoDto } from '../dto/delete-user-info.dto';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UpdateUserProfileDto } from '../dto/update-user-profile.dto';
import { UpdateUserEmailDto } from '../dto/update-user-email.dto';
import { UpdateUserPhoneDto } from '../dto/update-user-phone.dto';
import { UpdateUserAddressDto } from '../dto/update-user-address.dto';
import { Label } from '../entities/label.entity';
import { CacheService } from '../../cache/cache.service';

@Injectable()
export class UserInfoService {
  constructor(
    private readonly usersInfoProfileRepository: UsersInfoProfileRepository,
    private readonly usersInfoEmailRepository: UsersInfoEmailRepository,
    private readonly usersInfoPhoneRepository: UsersInfoPhoneRepository,
    private readonly usersInfoAddressRepository: UsersInfoAddressRepository,
    private readonly locationService: LocationService,
    private readonly userInfoTransformationService: UserInfoTransformationService,
    private readonly validationService: UserValidation,
    private readonly cacheService: CacheService,
    @InjectRepository(Label)
    private readonly labelRepository: Repository<Label>,
  ) {}

  async getUserInfo(locationSlug: string, userId: number, role?: string): Promise<UserInfoResponseBodyDto> {
    try {
      const normalizedRole = role as RolesEnum | undefined;
      // Check if user is a customer or teacher
      const isUser = normalizedRole
        ? [RolesEnum.CUSTOMER, RolesEnum.TEACHER].includes(normalizedRole)
        : false;

      let locationId: number;

      if (isUser) {
        const validationResult = await this.validationService.validateLocationAndCustomer(locationSlug, userId);
        locationId = validationResult.locationId;
      } else {
        locationId = await this.locationService.getLocationId(locationSlug);
      }

      //Get user info data
      const [profile, emails, phones, addresses, contactLabels] = await Promise.all([
        this.usersInfoProfileRepository.getUserProfile(userId, locationId, role, isUser),
        this.usersInfoEmailRepository.getUserEmails(userId, locationId, role, isUser),
        this.usersInfoPhoneRepository.getUserPhones(userId, locationId ,role, isUser),
        this.usersInfoAddressRepository.getUserAddresses(userId, locationId, role, isUser),
        this.getUserContactLabels(userId),
      ]);

      const userInfoData = await this.userInfoTransformationService.transformUserInfoToResponseBody(
        profile,
        emails,
        phones,
        addresses,
        contactLabels,
      );

      return userInfoData;

    } catch (error) {
      console.error('Error in getUserInfo service:', error);
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Failed to retrieve user info');
    }
  }

  async createUserInfo(
    locationSlug: string,
    locationId: number,
    userId: number,
    role: string,
    createDto: CreateUserInfoDto,
    currentUserId?: number,
  ): Promise<any> {
    try {
      const normalizedRole = role as RolesEnum;

      // Check if user is a customer or teacher
      const isFrontendUser = [RolesEnum.CUSTOMER, RolesEnum.TEACHER].includes(normalizedRole);

      if (isFrontendUser) {
        const isExist = await this.validationService.validateCustomerExists(userId, locationId);
        if (!isExist) {
          throw new NotFoundException(`${normalizedRole} with ID ${userId} not found in location ${locationSlug}`);
        }
      }
      // Get handler for the type
      const handler = this.getHandler(createDto.type);
      if (!handler) {
        throw new BadRequestException(`Invalid type: ${createDto.type}`);
      }

      // Validate data
      await this.validateDataOrThrow(handler.dtoClass, createDto.data);

      // Create user info
      return await handler.repository.create(
        userId,
        locationId,
        role,
        isFrontendUser,
        createDto.data,
        currentUserId,
      );

    } catch (error) {
      console.error('Error in createUserInfo service:', error);
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Failed to create user info');
    }
  }

  async updateUserInfo(
    locationSlug: string,
    locationId: number,
    userId: number,
    role: string,
    updateDto: CreateUserInfoDto,
    currentUserId?: number,
  ): Promise<any> {
    try {
      const normalizedRole = role as RolesEnum;

      // Check if user is a customer or teacher
      const isFrontendUser = [RolesEnum.CUSTOMER, RolesEnum.TEACHER].includes(normalizedRole);

      if (isFrontendUser) {
        const isExist = await this.validationService.validateCustomerExists(userId, locationId);
        if (!isExist) {
          throw new NotFoundException(`${normalizedRole} with ID ${userId} not found in location ${locationSlug}`);
        }
      }

      // Get handler for the type
      const handler = this.getHandler(updateDto.type);
      if (!handler) {
        throw new BadRequestException(`Invalid type: ${updateDto.type}`);
      }

      // Validate data
      await this.validateDataOrThrow(handler.dtoClass, updateDto.data);

      // Update user info
      return await handler.repository.update(
        userId,
        locationId,
        role,
        isFrontendUser,
        updateDto.data,
        currentUserId,
      );

    } catch (error) {
      console.error('Error in updateUserInfo service:', error);
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Failed to update user info');
    }
  }

  async deleteUserInfo(
    locationSlug: string,
    locationId: number,
    userId: number,
    role: string,
    deleteDto: DeleteUserInfoDto,
    currentUserId?: number,
  ): Promise<any> {
    try {
      const normalizedRole = role as RolesEnum;
      const isFrontendUser = [RolesEnum.CUSTOMER, RolesEnum.TEACHER].includes(normalizedRole);

      if (isFrontendUser) {
        const isExist = await this.validationService.validateCustomerExists(userId, locationId);
        if (!isExist) {
          throw new NotFoundException(`${normalizedRole} with ID ${userId} not found in location ${locationSlug}`);
        }
      }

      const handler = this.getHandler(deleteDto.type as UserInfoType);
      if (!handler || typeof handler.repository.delete !== 'function') {
        throw new BadRequestException(`Delete not supported for type: ${deleteDto.type}`);
      }

      return await handler.repository.delete(
        userId,
        locationId,
        role,
        isFrontendUser,
        deleteDto.id,
        currentUserId,
      );
    } catch (error) {
      console.error('Error in deleteUserInfo service:', error);
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Failed to delete user info');
    }
  }

  async updateUserStatus(
    locationSlug: string,
    locationId: number,
    userId: number,
    role: string,
    active: boolean,
  ): Promise<{ status: number; canLogin: boolean }> {
    try {
      const normalizedRole = role as RolesEnum;
      const isFrontendUser = [RolesEnum.CUSTOMER, RolesEnum.TEACHER].includes(normalizedRole);

      if (isFrontendUser) {
        const isExist = await this.validationService.validateCustomerExists(userId, locationId);
        if (!isExist) {
          throw new NotFoundException(`${normalizedRole} with ID ${userId} not found in location ${locationSlug}`);
        }
      }

      const result = await this.usersInfoProfileRepository.updateStatus(
        userId,
        locationId,
        normalizedRole,
        isFrontendUser,
        active,
      );

      if (result.accessToken) {
        await this.cacheService.forget(`auth:token:${result.accessToken}`);
      }

      if (normalizedRole === RolesEnum.CUSTOMER) {
        await this.cacheService.forget(`customer:list:${locationSlug}:default`);
      }

      return {
        status: result.status,
        canLogin: result.canLogin,
      };
    } catch (error) {
      console.error('Error in updateUserStatus service:', error);
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Failed to update user status');
    }
  }

  private getHandler(type: UserInfoType) {
    const handlers: Record<
      UserInfoType,
      {
        repository: any;
        dtoClass: new (...args: any[]) => any;
      }
    > = {
      profile: {
        repository: this.usersInfoProfileRepository,
        dtoClass: UpdateUserProfileDto,
      },
      email: {
        repository: this.usersInfoEmailRepository,
        dtoClass: UpdateUserEmailDto,
      },
      phone: {
        repository: this.usersInfoPhoneRepository,
        dtoClass: UpdateUserPhoneDto,
      },
      addresses: {
        repository: this.usersInfoAddressRepository,
        dtoClass: UpdateUserAddressDto,
      },
    };

    return handlers[type];
  }

  private async getUserContactLabels(userId: number): Promise<Array<{ id: number; name: string }>> {
    const labels = await this.labelRepository.find({
      where: [
        { userAdded: 0 },
        { userAdded: userId },
      ],
      order: {
        userAdded: 'ASC',
        id: 'ASC',
      },
      select: ['id', 'name'],
    });

    return labels.map((label) => ({
      id: label.id,
      name: label.name,
    }));
  }

  private async validateDataOrThrow(dtoClass: new (...args: any[]) => any, data: any): Promise<void> {
    const dto = plainToInstance(dtoClass, data);
    const errors = await validate(dto);
    if (errors.length > 0) {
      const errorMessages = errors.map((error: any) => Object.values(error.constraints || {}).join(', '));
      throw new BadRequestException(`Validation failed: ${errorMessages.join('; ')}`);
    }
  }
}
