import { Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import {
  UserInfoProfileDto,
  UserInfoEmailDto,
  UserInfoPhoneDto,
  UserInfoAddressDto,
  UserContactLabelDto,
  UserInfoDataDto,
  UserInfoResponseBodyDto,
} from '../../dto/user-info-response.dto';
import { UserContact } from 'src/user/entities/user-contact.entity';

@Injectable()
export class UserInfoTransformationService {
  /**
   * Transform profile raw data to UserInfoProfileDto
   */
  transformProfileToDto(profile: any): UserInfoProfileDto | null {
    if (!profile) {
      return null;
    }
    return plainToInstance(UserInfoProfileDto, profile, {
      excludeExtraneousValues: true,
    });
  }

  /**
   * Transform emails raw data array to UserInfoEmailDto array
   */
  transformEmailsToDtos(emails: any[]): UserInfoEmailDto[] {
    if (!emails || emails.length === 0) {
      return [];
    }
    return emails.map((email) =>
      plainToInstance(
        UserInfoEmailDto,
        {
          id: email.id,
          userContactId: email.userContactId,
          email: email.email,
          note: email.note || '',
          label: UserContact.getLabelName(email.userContact?.labelId, email.userContact?.label?.name),
          isPrimary: Boolean(email.userContact?.isPrimary),
        },
        { excludeExtraneousValues: true },
      ),
    );
  }

  /**
   * Transform phones raw data array to UserInfoPhoneDto array
   */
  transformPhonesToDtos(phones: any[]): UserInfoPhoneDto[] {
    if (!phones || phones.length === 0) {
      return [];
    }
    return phones.map((phone) =>
      plainToInstance(UserInfoPhoneDto, {
        id: phone.id,
        userContactId: phone.userContactId,
        number: phone.number,
        extension: phone.extension || '',
        note: phone.note || '',
        label: UserContact.getLabelName(phone.contact.labelId, phone.contact.label?.name),
        isPrimary: Boolean(phone.contact?.isPrimary),
      }, { excludeExtraneousValues: true }),
    );
  }

  /**
   * Transform addresses raw data array to UserInfoAddressDto array
   */
  transformAddressesToDtos(addresses: any[]): UserInfoAddressDto[] {
    if (!addresses || addresses.length === 0) {
      return [];
    }
    return addresses.map((address) =>
      plainToInstance(UserInfoAddressDto, {
        id: address.id,
        address: address.address,
        cityId: address.cityId,
        city: address.city?.name || '',
        provinceId: address.provinceId,
        province: address.province?.name || '',
        countryId: address.countryId,
        country: address.country?.name || '',
        postalCode: address.postalCode || '',
        label: UserContact.getLabelName(address.userContact.labelId, address.userContact.label?.name),
        isPrimary: Boolean(address.userContact.isPrimary),
      }, { excludeExtraneousValues: true }),
    );
  }

  transformContactLabelsToDtos(contactLabels: any[]): UserContactLabelDto[] {
    if (!contactLabels || contactLabels.length === 0) {
      return [];
    }

    return contactLabels.map((label) =>
      plainToInstance(
        UserContactLabelDto,
        {
          id: label.id,
          name: label.name,
        },
        { excludeExtraneousValues: true },
      ),
    );
  }

  /**
   * Transform all user info data to UserInfoResponseBodyDto (with body wrapper)
   */
  transformUserInfoToResponseBody(
    profile: any,
    emails: any[],
    phones: any[],
    addresses: any[],
    contactLabels: any[] = [],
  ): UserInfoResponseBodyDto {
    const dtoData = {
      profile: this.transformProfileToDto(profile),
      email: this.transformEmailsToDtos(emails),
      phone: this.transformPhonesToDtos(phones),
      addresses: this.transformAddressesToDtos(addresses),
      contactLabels: this.transformContactLabelsToDtos(contactLabels),
    };

    const userInfoData = plainToInstance(UserInfoDataDto, dtoData, {
      excludeExtraneousValues: true,
    });
    
    return plainToInstance(UserInfoResponseBodyDto, {
      body: userInfoData,
    }, {
      excludeExtraneousValues: true,
    });
  }
}
