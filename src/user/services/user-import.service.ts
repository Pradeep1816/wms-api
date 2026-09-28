import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';
import { User } from '../entities/user.entity';
import { UserCreateRepository } from '../repositories/user-create.repository';
import { UserImportRepository } from '../repositories/user-import.repository';
import { StudentRepository } from '../../student/repositories/student.repository';
import { LocationService } from '../../location/services/location.service';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { UserImportResponseDto } from '../dto/user-import-response.dto';
import { UserContact } from '../entities/user-contact.entity';
import { StudentStatus } from '../../student/enums/student-status.enum';

/**
 * Parse CSV buffer into rows of key-value (header -> value).
 * Handles quoted fields and strips BOM from first header.
 */
function parseCsvBuffer(buffer: Buffer): Record<string, string>[] {
  const text = buffer.toString('utf8');
  const lines = text.split(/\r?\n/).filter((line) => line.length > 0);
  if (lines.length < 2) return [];

  const parseRow = (line: string): string[] => {
    const out: string[] = [];
    let i = 0;
    while (i < line.length) {
      if (line[i] === '"') {
        i += 1;
        let cell = '';
        while (i < line.length && line[i] !== '"') {
          if (line[i] === '\\') i += 1;
          cell += line[i];
          i += 1;
        }
        if (line[i] === '"') i += 1;
        out.push(cell);
        if (line[i] === ',') i += 1;
      } else {
        let cell = '';
        while (i < line.length && line[i] !== ',') {
          cell += line[i];
          i += 1;
        }
        out.push(cell.trim());
        if (line[i] === ',') i += 1;
      }
    }
    return out;
  };

  const rawHeaders = parseRow(lines[0]);
  const headers = rawHeaders.map((h) => {
    let name = h.trim();
    if (name.charCodeAt(0) === 0xfeff) name = name.slice(1);
    return name;
  });

  const rows: Record<string, string>[] = [];
  for (let r = 1; r < lines.length; r++) {
    const values = parseRow(lines[r]);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = values[i] !== undefined ? values[i].trim() : '';
    });
    rows.push(row);
  }
  return rows;
}

@Injectable()
export class UserImportService {
  private readonly logger = new Logger(UserImportService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly userCreateRepository: UserCreateRepository,
    private readonly userImportRepository: UserImportRepository,
    private readonly studentRepository: StudentRepository,
    private readonly locationService: LocationService,
  ) {}

  async importFromCsv(
    locationSlug: string,
    fileBuffer: Buffer,
    createdByUserId: number,
  ): Promise<UserImportResponseDto> {
    const locationId = await this.locationService.getLocationId(locationSlug);
    if (!locationId) {
      throw new NotFoundException(`Location with slug ${locationSlug} not found`);
    }

    const rows = parseCsvBuffer(fileBuffer);
    const errors: string[] = [];
    let studentCount = 0;
    let customerCount = 0;

    this.logger.log(
      `[Import] Starting for location=${locationSlug} (id=${locationId}), rows=${rows.length}`,
    );

    await this.dataSource.transaction(async (manager) => {
      if (manager.queryRunner) {
        manager.queryRunner.data = {
          ...(manager.queryRunner.data ?? {}),
          currentUserId: createdByUserId,
        };
      }

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const lineNum = i + 2;
        const billingHomeTel = (row['Billing Home Tel'] || '').trim();
        const studentName = `${(row['First Name'] || '').trim()} ${(row['Last Name'] || '').trim()}`.trim();

        if (!billingHomeTel) {
          this.logger.debug(`[Import] Line ${lineNum}: skipped (no Billing Home Tel)`);
          continue;
        }

        try {
          const existingUser = await this.userImportRepository.findUserByPhoneInLocation(
            billingHomeTel,
            locationId,
            manager,
          );

          if (existingUser) {
            this.logger.log(
              `[Import] Line ${lineNum}: found existing customer userId=${existingUser.id} by phone="${billingHomeTel}" → adding student only (no new customer)`,
            );
            const birthDate = this.parseBirthDate(row['Date of Birth']);
            const student = await this.studentRepository.createStudentInTransaction(
              manager,
              {
                firstName: (row['First Name'] || '').trim().slice(0, 30),
                lastName: (row['Last Name'] || '').trim().slice(0, 30),
                customerId: existingUser.id,
                birthDate,
                status: StudentStatus.ACTIVE,
              },
              createdByUserId,
            );
            await this.userImportRepository.saveStudentCsv(student.id, row, manager);
            studentCount += 1;
            continue;
          }

          this.logger.log(
            `[Import] Line ${lineNum}: no customer with phone="${billingHomeTel}" → creating new customer + student for "${studentName}"`,
          );
          const authKey = crypto.randomBytes(32).toString('base64').slice(0, 32);
          const accessToken = crypto.randomBytes(40).toString('base64').slice(0, 40);
          const passwordHash = await bcrypt
            .hash(crypto.randomBytes(8).toString('base64'), 10)
            .then((h) => h.replace(/^\$2[abx]\$/, '$2y$'));

          const user = await this.userCreateRepository.createUser(
            {
              status: User.STATUS_ACTIVE,
              canLogin: false,
              canMerge: false,
              authKey,
              accessToken,
              passwordHash,
            },
            manager,
          );
          customerCount += 1;
          this.logger.debug(`[Import] Line ${lineNum}: created new customer userId=${user.id}`);

          await this.userCreateRepository.createCustomerAccount(user.id, manager);
          const userProfile = await this.userCreateRepository.createUserProfile(
            user.id,
            'en-US',
            manager,
          );
          await this.userCreateRepository.assignRole(user.id, RolesEnum.CUSTOMER, manager);
          await this.userCreateRepository.createUserLocation(user.id, locationId, manager);
          await this.userCreateRepository.updateUserProfile(
            userProfile,
            {
              firstname: (row['Billing First Name'] || '').trim(),
              lastname: (row['Billing Last Name'] || '').trim(),
              locale: 'en-US',
            },
            manager,
          );

          const emailNotificationTypes =
            await this.userCreateRepository.getAllNotificationEmailTypes(manager);
          for (const t of emailNotificationTypes) {
            await this.userCreateRepository.createCustomerEmailNotification(
              user.id,
              t.id,
              manager,
            );
          }

          if ((row['Email Address'] || '').trim()) {
            const contact = await this.userImportRepository.createUserContactWithLabel(
              user.id,
              UserContact.LABEL_HOME,
              true,
              manager,
            );
            await this.userCreateRepository.createUserEmail(
              (row['Email Address'] || '').trim(),
              contact.id,
              manager,
            );
          }

          const billingAddress = (row['Billing Address'] || '').trim();
          if (billingAddress) {
            const cityName = (row['Billing City'] || row['City'] || '').trim() || 'Unknown';
            const contactAddr = await this.userImportRepository.createUserContactWithLabel(
              user.id,
              UserContact.LABEL_HOME,
              true,
              manager,
            );
            await this.userImportRepository.createUserAddress(
              contactAddr.id,
              billingAddress,
              cityName,
              (row['Billing Postal Code'] || '').trim(),
              createdByUserId,
              manager,
            );
          }

          const contactHome = await this.userImportRepository.createUserContactWithLabel(
            user.id,
            UserContact.LABEL_HOME,
            true,
            manager,
          );
          await this.userImportRepository.createUserPhone(
            contactHome.id,
            billingHomeTel,
            undefined,
            manager,
          );

          if ((row['Billing Work Tel'] || '').trim()) {
            const contactWork = await this.userImportRepository.createUserContactWithLabel(
              user.id,
              UserContact.LABEL_WORK,
              false,
              manager,
            );
            await this.userImportRepository.createUserPhone(
              contactWork.id,
              (row['Billing Work Tel'] || '').trim(),
              (row['Billing Work Tel Ext.'] || '').trim(),
              manager,
            );
          }
          if ((row['Billing Other Tel'] || '').trim()) {
            const contactOther = await this.userImportRepository.createUserContactWithLabel(
              user.id,
              UserContact.LABEL_OTHER,
              false,
              manager,
            );
            await this.userImportRepository.createUserPhone(
              contactOther.id,
              (row['Billing Other Tel'] || '').trim(),
              (row['Billing Other Tel Ext.'] || '').trim(),
              manager,
            );
          }

          const birthDate = this.parseBirthDate(row['Date of Birth']);
          const student = await this.studentRepository.createStudentInTransaction(
            manager,
            {
              firstName: (row['First Name'] || '').trim().slice(0, 30),
              lastName: (row['Last Name'] || '').trim().slice(0, 30),
              customerId: user.id,
              birthDate,
              status: StudentStatus.ACTIVE,
            },
            createdByUserId,
          );
          await this.userImportRepository.saveStudentCsv(student.id, row, manager);
          studentCount += 1;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.warn(`[Import] Line ${lineNum} failed: ${msg}`);
          errors.push(`Error on Line ${lineNum}: ${msg}`);
        }
      }
    });

    this.logger.log(
      `[Import] Done. students=${studentCount} customersCreated=${customerCount} totalRows=${rows.length} errors=${errors.length}`,
    );

    return {
      successCount: studentCount + customerCount,
      studentCount,
      customerCount,
      errors,
      totalRows: rows.length,
    };
  }

  private parseBirthDate(value: string | undefined): Date | undefined {
    const v = (value || '').trim();
    if (!v) return undefined;
    const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return undefined;
    const month = parseInt(m[1], 10);
    const day = parseInt(m[2], 10);
    const year = parseInt(m[3], 10);
    const d = new Date(year, month - 1, day);
    return isNaN(d.getTime()) ? undefined : d;
  }
}
