import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import {
  CreateDigitalEnrollmentInvitationDto,
  DigitalEnrollmentStudentDto,
  UpdateDigitalEnrollmentSubmissionStatusDto,
} from './create-digital-enrollment-submission.dto';

describe('digital enrolment DTO validation', () => {
  it.each([
    undefined,
    null,
    '',
    'Student Tom Brown’s enrolment has been marked as completed.',
  ])('accepts completion with an optional note: %s', async (completionNote) => {
    const dto = plainToInstance(UpdateDigitalEnrollmentSubmissionStatusDto, {
      status: 'converted',
      completionNote,
    });
    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it.each([123, {}, 'x'.repeat(2001)])(
    'rejects an invalid completion note',
    async (completionNote) => {
      const dto = plainToInstance(UpdateDigitalEnrollmentSubmissionStatusDto, {
        status: 'converted',
        completionNote,
      });
      const errors = await validate(dto);
      expect(errors.map(({ property }) => property)).toContain(
        'completionNote',
      );
    },
  );

  it('requires a customer name and valid email for an invitation', async () => {
    const emptyInvitation = plainToInstance(CreateDigitalEnrollmentInvitationDto, {
      customerName: ' ',
      customerEmail: 'not-an-email',
    });

    const errors = await validate(emptyInvitation);

    expect(errors.map(({ property }) => property)).toEqual(
      expect.arrayContaining(['customerName', 'customerEmail']),
    );
  });

  it('trims and accepts valid invitation customer details', async () => {
    const invitation = plainToInstance(CreateDigitalEnrollmentInvitationDto, {
      customerName: '  Jamie Customer  ',
      customerEmail: '  jamie@example.com  ',
      expiresInDays: 14,
    });

    await expect(validate(invitation)).resolves.toHaveLength(0);
    expect(invitation.customerName).toBe('Jamie Customer');
    expect(invitation.customerEmail).toBe('jamie@example.com');
  });

  it('requires address, city, postal code, and the selected province/country in the submitted student profile', async () => {
    const student = plainToInstance(DigitalEnrollmentStudentDto, {
      fullName: 'Student Name',
      address: ' ',
      city: ' ',
      postalCode: ' ',
    });

    const errors = await validate(student);
    const properties = errors.map(({ property }) => property);

    expect(properties).toEqual(
      expect.arrayContaining([
        'address',
        'city',
        'postalCode',
        'province',
        'provinceId',
        'country',
        'countryId',
      ]),
    );
  });

  it('accepts a student profile with the selected city/province/country', async () => {
    const student = plainToInstance(DigitalEnrollmentStudentDto, {
      fullName: 'Student Name',
      address: '123 Main St',
      city: 'Burlington',
      cityId: 5,
      province: 'Ontario',
      provinceId: 1,
      country: 'Canada',
      countryId: 1,
      postalCode: 'L7L1A1',
    });

    await expect(validate(student)).resolves.toHaveLength(0);
  });
});
