import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  DigitalEnrollmentPaymentMethod,
  DigitalEnrollmentSubmissionStatus,
} from '../entities/digital-enrollment-submission.entity';

const genders = ['male', 'female', 'not-specified'] as const;
const programTypes = ['core', 'contemporary', 'hybrid'] as const;
const deliveryModes = ['in-person', 'online'] as const;
const paymentPreferences = ['monthly', 'three-month', 'six-month', 'twelve-month'] as const;
const phoneNumberPattern = /^\D*(\d\D*){10}$/;

export class DigitalEnrollmentStudentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  fullName: string;

  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsIn(genders)
  gender?: (typeof genders)[number];

  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsDateString()
  birthDate?: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  address: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  city: string;

  // Selected city/province/country come from the enrolment form's dropdowns,
  // which are populated from the location geodata tables. The names are kept for
  // display (PDF / admin detail); the ids drive the customer address records on
  // conversion. cityId is optional: a city typed but not matched to the list is
  // resolved by name under the chosen province at conversion time.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  cityId?: number;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  province: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  provinceId: number;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  country: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  countryId: number;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  postalCode: string;

  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsString()
  @MaxLength(32)
  @Matches(phoneNumberPattern, { message: 'homePhone must contain exactly 10 digits' })
  homePhone?: string;

  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsString()
  @MaxLength(32)
  @Matches(phoneNumberPattern, { message: 'cellPhone must contain exactly 10 digits' })
  cellPhone?: string;
}

export class DigitalEnrollmentGuardiansDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  primaryName: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  secondaryName?: string;

  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsString()
  @MaxLength(32)
  @Matches(phoneNumberPattern, { message: 'primaryPhone must contain exactly 10 digits' })
  primaryPhone?: string;

  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsString()
  @MaxLength(32)
  @Matches(phoneNumberPattern, { message: 'secondaryPhone must contain exactly 10 digits' })
  secondaryPhone?: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @IsEmail()
  @MaxLength(255)
  primaryEmail: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() || undefined : value))
  @IsString()
  @IsEmail()
  @MaxLength(255)
  secondaryEmail?: string;
}

export class DigitalEnrollmentProgramPreferenceDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  programId?: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  instrument: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  instructor?: string;

  @IsIn(programTypes)
  programType: (typeof programTypes)[number];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class DigitalEnrollmentSchedulePreferenceDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  day: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(16)
  time: string;

  @IsDateString()
  startDate: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(16)
  lessonDuration: string;

  @IsIn(deliveryModes)
  deliveryMode: (typeof deliveryModes)[number];
}

export class DigitalEnrollmentFeeSnapshotDto {
  @IsOptional()
  @IsString()
  @MaxLength(32)
  lessonFee?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  rentalFee?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  booksFee?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  registrationFee?: string;

  @IsIn(paymentPreferences)
  paymentPreference: (typeof paymentPreferences)[number];
}

export class DigitalEnrollmentSignatureDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  printedName: string;

  @IsDateString()
  signedDate: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^data:image\/png;base64,/)
  dataUrl: string;
}

export class DigitalEnrollmentParentPreferenceDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(500)
  instruments?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(500)
  preferredDaysTimes?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return undefined;
  })
  @IsBoolean()
  rentalRequired?: boolean;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class DigitalEnrollmentAdditionalStudentDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  fullName: string;

  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsIn(genders)
  gender?: (typeof genders)[number];

  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsDateString()
  birthDate?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => DigitalEnrollmentParentPreferenceDto)
  parentPreference?: DigitalEnrollmentParentPreferenceDto;
}

export class CreateDigitalEnrollmentSubmissionDto {
  @ValidateNested()
  @Type(() => DigitalEnrollmentStudentDto)
  student: DigitalEnrollmentStudentDto;

  // Extra students on the same family form. Shared customer/guardian info stays
  // on `guardians`; each extra student carries its own instrument preferences.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(9)
  @ValidateNested({ each: true })
  @Type(() => DigitalEnrollmentAdditionalStudentDto)
  additionalStudents?: DigitalEnrollmentAdditionalStudentDto[];

  @ValidateNested()
  @Type(() => DigitalEnrollmentGuardiansDto)
  guardians: DigitalEnrollmentGuardiansDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => DigitalEnrollmentProgramPreferenceDto)
  programPreference?: DigitalEnrollmentProgramPreferenceDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => DigitalEnrollmentSchedulePreferenceDto)
  schedulePreference?: DigitalEnrollmentSchedulePreferenceDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => DigitalEnrollmentFeeSnapshotDto)
  feeSnapshot?: DigitalEnrollmentFeeSnapshotDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => DigitalEnrollmentParentPreferenceDto)
  parentPreference?: DigitalEnrollmentParentPreferenceDto;

  @IsObject()
  policies: Record<string, boolean>;

  @ValidateNested()
  @Type(() => DigitalEnrollmentSignatureDto)
  signature: DigitalEnrollmentSignatureDto;

  /** Kiosk PIN, required only when submitting through a kiosk (permanent) link. */
  @IsOptional()
  @IsString()
  kioskPin?: string;
}

export class DigitalEnrollmentPolicyAcknowledgementDto {
  @IsBoolean()
  acknowledged: boolean;
}

export class UpdateDigitalEnrollmentSubmissionStatusDto {
  @IsEnum(DigitalEnrollmentSubmissionStatus)
  status: DigitalEnrollmentSubmissionStatus;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  completionNote?: string | null;
}

export class UpdateDigitalEnrollmentPaymentMethodDto {
  // Staff may clear the method back to "Not selected" ('' / null), which leaves
  // the payment section blank so nothing about payment is fabricated.
  @Transform(({ value }) => (value === '' || value === null ? null : value))
  @IsOptional()
  @IsEnum(DigitalEnrollmentPaymentMethod)
  paymentMethod: DigitalEnrollmentPaymentMethod | null;
}

/**
 * Staff-entered payment figures. Each is optional and free-form text (a money
 * amount like "108.75"); an empty string clears that figure. Independent of the
 * payment method. Only the keys sent are changed. Total Fee Payable is NOT stored
 * — it is the sum of these three and is derived wherever it is shown.
 */
export class UpdateDigitalEnrollmentPaymentAmountsDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(32)
  lessonPaymentFee?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(32)
  rentalFee?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(32)
  booksFee?: string;
}

export class VoidDigitalEnrollmentSubmissionDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}

export class DigitalEnrollmentCustomerCandidatesQueryDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(255)
  search?: string;
}

export class DigitalEnrollmentStudentCandidatesQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  customerId?: number;
}

export class UpdateDigitalEnrollmentDetailsDto {
  @IsOptional()
  @IsObject()
  student?: Record<string, string>;

  @IsOptional()
  @IsObject()
  guardians?: Record<string, string>;
}

export class SetupDigitalEnrollmentKioskDto {
  @IsString()
  @Matches(/^\d{4,8}$/, { message: 'PIN must be 4 to 8 digits.' })
  pin: string;
}

export class VerifyDigitalEnrollmentKioskPinDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(8)
  pin: string;
}

export class LinkDigitalEnrollmentCustomerDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  customerId?: number;
}

export class LinkDigitalEnrollmentStudentDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  studentId?: number;
}

export class LinkDigitalEnrollmentEnrolmentDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  enrolmentId: number;
}

export class CreateDigitalEnrollmentInvitationDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @IsEmail()
  @MaxLength(255)
  customerEmail: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  customerName: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  expiresInDays?: number;
}

export class SendDigitalEnrollmentEmailDto {
  @IsOptional()
  @IsArray()
  @IsEmail({}, { each: true })
  to?: string[];

  @IsOptional()
  @IsArray()
  @IsEmail({}, { each: true })
  bcc?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(255)
  subject?: string;

  /** Custom note from the front desk, shown near the top of the email. */
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  message?: string;

  /** When false, the completed-form PDF link is omitted from the email. */
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return undefined;
  })
  @IsBoolean()
  includePdfLink?: boolean;

  @IsOptional()
  @IsString()
  content?: string;
}

export class SendDigitalEnrollmentInvitationEmailDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  enrollmentUrl: string;

  /** Custom welcome message from the front desk, shown in the invitation email body. */
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  message?: string;
}
