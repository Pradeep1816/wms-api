import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DigitalEnrollmentSubmissionService } from './digital-enrollment-submission.service';

/**
 * When staff convert a digital enrolment into a customer, the address and the
 * secondary contact details the parent entered must land on the new customer
 * profile. They used to be dropped: customer creation only records the primary
 * email and one phone, so the Address block stayed blank and the second
 * email/phone were lost (reported by the client against Burlington).
 *
 * `transferApplicationContactsToCustomer` is the piece that copies them over.
 * These tests pin what it writes and, just as importantly, what it must NOT
 * duplicate. The three contact repositories and the location lookup are the only
 * collaborators this path touches, so — as the prepaid spec does — the service
 * is built through `Object.create` with just those stubbed, rather than standing
 * up the seventeen-parameter constructor.
 */
describe('digital enrolment, transferring application contacts to a new customer', () => {
  let service: DigitalEnrollmentSubmissionService;
  let addressCreate: ReturnType<typeof vi.fn>;
  let emailCreate: ReturnType<typeof vi.fn>;
  let phoneCreate: ReturnType<typeof vi.fn>;

  const LOCATION_ID = 7;
  const CUSTOMER_ID = 4242;
  const USER_ID = 99;
  // The location the customer is enrolling at supplies province/country, which
  // the form does not collect.
  const location = { provinceId: 3, countryId: 2 };

  beforeEach(() => {
    addressCreate = vi.fn().mockResolvedValue(undefined);
    emailCreate = vi.fn().mockResolvedValue(undefined);
    phoneCreate = vi.fn().mockResolvedValue(undefined);

    service = Object.assign(
      Object.create(DigitalEnrollmentSubmissionService.prototype) as DigitalEnrollmentSubmissionService,
      {
        logger: { warn: vi.fn(), log: vi.fn(), error: vi.fn() },
        locationRepository: { getLocationDetails: vi.fn().mockResolvedValue(location) },
        customersInfoAddressRepository: { create: addressCreate },
        customersInfoEmailRepository: { create: emailCreate },
        customersInfoPhoneRepository: { create: phoneCreate },
      },
    );
  });

  const transfer = (
    submission: unknown,
    primaryPhoneUsed: string,
  ): Promise<void> =>
    (
      service as unknown as {
        transferApplicationContactsToCustomer: (
          locationId: number,
          customerId: number,
          submission: unknown,
          primaryPhoneUsed: string,
          loggedUserId: number,
        ) => Promise<void>;
      }
    ).transferApplicationContactsToCustomer(LOCATION_ID, CUSTOMER_ID, submission, primaryPhoneUsed, USER_ID);

  const fullSubmission = {
    id: 1,
    studentData: {
      address: '123 Playwright Test Ave',
      city: 'Burlington',
      postalCode: 'L7L1A1',
    },
    guardianData: {
      primaryEmail: 'primary@example.com',
      primaryPhone: '4161112222',
      secondaryEmail: 'secondary@example.com',
      secondaryPhone: '4163334444',
    },
  };

  it('writes the address with province/country defaulted from the location for older submissions without geo', async () => {
    // fullSubmission predates the province/country dropdowns, so no *Id fields.
    await transfer(fullSubmission, '4161112222');

    expect(addressCreate).toHaveBeenCalledTimes(1);
    expect(addressCreate).toHaveBeenCalledWith(
      CUSTOMER_ID,
      LOCATION_ID,
      expect.objectContaining({
        address: '123 Playwright Test Ave',
        city: 'Burlington',
        postalCode: 'L7L1A1',
        provinceId: location.provinceId,
        countryId: location.countryId,
        isPrimary: true,
      }),
      USER_ID,
    );
  });

  it('writes the address with the province/country/city the customer selected on the form', async () => {
    const locationLookup = vi.fn();
    (service as unknown as { locationRepository: { getLocationDetails: typeof locationLookup } }).locationRepository.getLocationDetails = locationLookup;

    await transfer(
      {
        ...fullSubmission,
        studentData: {
          ...fullSubmission.studentData,
          cityId: 55,
          province: 'Quebec',
          provinceId: 9,
          country: 'Canada',
          countryId: 1,
        },
      },
      '4161112222',
    );

    expect(addressCreate).toHaveBeenCalledWith(
      CUSTOMER_ID,
      LOCATION_ID,
      expect.objectContaining({
        address: '123 Playwright Test Ave',
        city: 'Burlington',
        cityId: 55,
        provinceId: 9,
        countryId: 1,
        isPrimary: true,
      }),
      USER_ID,
    );
    // The submitted ids are authoritative, so the location is never consulted.
    expect(locationLookup).not.toHaveBeenCalled();
  });

  it('adds the secondary email as a non-primary email', async () => {
    await transfer(fullSubmission, '4161112222');

    expect(emailCreate).toHaveBeenCalledTimes(1);
    expect(emailCreate).toHaveBeenCalledWith(
      CUSTOMER_ID,
      LOCATION_ID,
      { email: 'secondary@example.com', isPrimary: false },
      USER_ID,
    );
  });

  it('adds the secondary phone as a non-primary phone', async () => {
    await transfer(fullSubmission, '4161112222');

    expect(phoneCreate).toHaveBeenCalledTimes(1);
    expect(phoneCreate).toHaveBeenCalledWith(
      CUSTOMER_ID,
      LOCATION_ID,
      { number: '4163334444', isPrimary: false },
      USER_ID,
    );
  });

  it('does not re-add the secondary phone when it was already used as the primary phone', async () => {
    // Parent left primaryPhone blank; creation fell back to secondaryPhone for
    // the primary, so it must not be added a second time.
    await transfer(
      {
        ...fullSubmission,
        guardianData: { ...fullSubmission.guardianData, primaryPhone: '' },
      },
      '4163334444',
    );

    expect(phoneCreate).not.toHaveBeenCalled();
  });

  it('does not add a secondary email that duplicates the primary email (case-insensitive)', async () => {
    await transfer(
      {
        ...fullSubmission,
        guardianData: { ...fullSubmission.guardianData, secondaryEmail: 'PRIMARY@example.com' },
      },
      '4161112222',
    );

    expect(emailCreate).not.toHaveBeenCalled();
  });

  it('skips the address entirely when no street was provided', async () => {
    await transfer(
      { ...fullSubmission, studentData: { address: '', city: 'Burlington', postalCode: 'L7L1A1' } },
      '4161112222',
    );

    expect(addressCreate).not.toHaveBeenCalled();
  });

  it('one contact failing does not stop the others (best-effort)', async () => {
    addressCreate.mockRejectedValueOnce(new Error('db blip'));

    await transfer(fullSubmission, '4161112222');

    // Address threw, but the secondary email and phone were still written.
    expect(emailCreate).toHaveBeenCalledTimes(1);
    expect(phoneCreate).toHaveBeenCalledTimes(1);
  });
});
