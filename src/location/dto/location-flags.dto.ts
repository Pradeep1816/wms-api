import {
  IsObject,
  IsString,
  IsIn,
  ValidateNested,
  IsOptional,
} from 'class-validator';
import { Type } from 'class-transformer';

export class LocationFlagsData {
  @IsOptional()
  @IsString()
  @IsIn(['modern', 'legacy', 'disabled'])
  dashboard?: string;

  @IsOptional()
  @IsString()
  @IsIn(['modern', 'legacy', 'disabled'])
  schedule?: string;

  @IsOptional()
  @IsString()
  @IsIn(['modern', 'legacy', 'disabled'])
  enrolments?: string;

  @IsOptional()
  @IsString()
  @IsIn(['modern', 'legacy', 'disabled'])
  students?: string;

  @IsOptional()
  @IsString()
  @IsIn(['modern', 'legacy', 'disabled'])
  customers?: string;

  @IsOptional()
  @IsString()
  @IsIn(['modern', 'legacy', 'disabled'])
  teachers?: string;

  @IsOptional()
  @IsString()
  @IsIn(['modern', 'legacy', 'disabled'])
  privateLessons?: string;

  @IsOptional()
  @IsString()
  @IsIn(['modern', 'legacy', 'disabled'])
  groupCourses?: string;

  @IsOptional()
  @IsString()
  @IsIn(['modern', 'legacy', 'disabled'])
  unscheduledLessons?: string;

  @IsOptional()
  @IsString()
  @IsIn(['modern', 'legacy', 'disabled'])
  recurringPayments?: string;

  @IsOptional()
  @IsString()
  @IsIn(['modern', 'legacy', 'disabled'])
  paymentPreferences?: string;

  @IsOptional()
  @IsString()
  @IsIn(['modern', 'legacy', 'disabled'])
  invoices?: string;

  @IsOptional()
  @IsString()
  @IsIn(['modern', 'legacy', 'disabled'])
  payments?: string;

  @IsOptional()
  @IsString()
  @IsIn(['modern', 'legacy', 'disabled'])
  reports?: string;

  @IsOptional()
  @IsString()
  @IsIn(['modern', 'legacy', 'disabled'])
  releaseNotes?: string;

  @IsOptional()
  @IsString()
  @IsIn(['modern', 'legacy', 'disabled'])
  items?: string;

  @IsOptional()
  @IsString()
  @IsIn(['modern', 'legacy', 'disabled'])
  admin?: string;

  @IsOptional()
  @IsString()
  @IsIn(['modern', 'legacy', 'disabled'])
  setup?: string;

  @IsOptional()
  @IsString()
  @IsIn(['modern', 'legacy', 'disabled'])
  timeline?: string;

  // Reports Sub-menu
  @IsOptional()
  @IsString()
  @IsIn(['modern', 'legacy', 'disabled'])
  accountReceivable?: string;

  @IsOptional()
  @IsString()
  @IsIn(['modern', 'legacy', 'disabled'])
  financialSummary?: string;

  @IsOptional()
  @IsString()
  @IsIn(['modern', 'legacy', 'disabled'])
  birthdays?: string;

  @IsOptional()
  @IsString()
  @IsIn(['modern', 'legacy', 'disabled'])
  paymentsReport?: string;

  @IsOptional()
  @IsString()
  @IsIn(['modern', 'legacy', 'disabled'])
  royalty?: string;

  @IsOptional()
  @IsString()
  @IsIn(['modern', 'legacy', 'disabled'])
  taxCollected?: string;

  @IsOptional()
  @IsString()
  @IsIn(['modern', 'legacy', 'disabled'])
  royaltyFree?: string;

  @IsOptional()
  @IsString()
  @IsIn(['modern', 'legacy', 'disabled'])
  reportItems?: string;

  @IsOptional()
  @IsString()
  @IsIn(['modern', 'legacy', 'disabled'])
  itemsByCategory?: string;

  @IsOptional()
  @IsString()
  @IsIn(['modern', 'legacy', 'disabled'])
  discount?: string;

  @IsOptional()
  @IsString()
  @IsIn(['modern', 'legacy', 'disabled'])
  salesAndPayment?: string;

  @IsOptional()
  @IsString()
  @IsIn(['modern', 'legacy', 'disabled'])
  allLocations?: string;

  @IsOptional()
  @IsString()
  @IsIn(['modern', 'legacy', 'disabled'])
  rentals?: string;

  // Admin Sub-menu
  @IsOptional()
  @IsString()
  @IsIn(['modern', 'legacy', 'disabled'])
  administrators?: string;

  @IsOptional()
  @IsString()
  @IsIn(['modern', 'legacy', 'disabled'])
  programs?: string;

  @IsOptional()
  @IsString()
  @IsIn(['modern', 'legacy', 'disabled'])
  cities?: string;

  @IsOptional()
  @IsString()
  @IsIn(['modern', 'legacy', 'disabled'])
  provinces?: string;

  @IsOptional()
  @IsString()
  @IsIn(['modern', 'legacy', 'disabled'])
  countries?: string;

  @IsOptional()
  @IsString()
  @IsIn(['modern', 'legacy', 'disabled'])
  taxes?: string;

  @IsOptional()
  @IsString()
  @IsIn(['modern', 'legacy', 'disabled'])
  colorCode?: string;

  @IsOptional()
  @IsString()
  @IsIn(['modern', 'legacy', 'disabled'])
  itemCategory?: string;

  @IsOptional()
  @IsString()
  @IsIn(['modern', 'legacy', 'disabled'])
  reminderNotes?: string;

  @IsOptional()
  @IsString()
  @IsIn(['modern', 'legacy', 'disabled'])
  blogs?: string;

  @IsOptional()
  @IsString()
  @IsIn(['modern', 'legacy', 'disabled'])
  locations?: string;

  @IsOptional()
  @IsString()
  @IsIn(['modern', 'legacy', 'disabled'])
  holidays?: string;

  @IsOptional()
  @IsString()
  @IsIn(['modern', 'legacy', 'disabled'])
  emailTemplate?: string;

  @IsOptional()
  @IsString()
  @IsIn(['modern', 'legacy', 'disabled'])
  testEmail?: string;

  @IsOptional()
  @IsString()
  @IsIn(['modern', 'legacy', 'disabled'])
  termsOfService?: string;

  @IsOptional()
  @IsString()
  @IsIn(['modern', 'legacy', 'disabled'])
  teacherDocumentDisclosures?: string;

  @IsOptional()
  @IsString()
  @IsIn(['modern', 'legacy', 'disabled'])
  referralSources?: string;

  // Setup Sub-menu
  @IsOptional()
  @IsString()
  @IsIn(['modern', 'legacy', 'disabled'])
  privileges?: string;

  @IsOptional()
  @IsString()
  @IsIn(['modern', 'legacy', 'disabled'])
  staffMembers?: string;

  @IsOptional()
  @IsString()
  @IsIn(['modern', 'legacy', 'disabled'])
  owners?: string;

  @IsOptional()
  @IsString()
  @IsIn(['modern', 'legacy', 'disabled'])
  classrooms?: string;

  @IsOptional()
  @IsString()
  @IsIn(['modern', 'legacy', 'disabled'])
  import?: string;

  @IsOptional()
  @IsString()
  @IsIn(['modern', 'legacy', 'disabled'])
  locationSettings?: string;
}

export class UpdateLocationFlagsDto {
  @IsObject()
  @ValidateNested()
  @Type(() => LocationFlagsData)
  flags: LocationFlagsData;
}
