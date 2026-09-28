import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { User } from "src/user/entities/user.entity";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { LogObjectRepository } from "../repositories/log-object.repository";
import { LogActivityRepository } from "../repositories/log-activity.repository";
import { LogRepository } from "../repositories/log.repository";
import { LogActivityType } from "../enums/log-activity.enum";
import { StudentGender } from "src/student/enums/student-status.enum";

// Interface for student log parameters
export interface StudentLogParams {
    action: string;
    studentId: number;
    studentName: string;
    loggedUserId: number;
    locationId: number;
    locationSlug: string;
    data?: any;
    programName?: string;
}


@Injectable()
export class LogStudentService {
    constructor(
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
        private readonly logObjectRepository: LogObjectRepository,
        private readonly logActivityRepository: LogActivityRepository,
        private readonly logRepository: LogRepository,
    ) { }

    private readonly baseUrl = process.env.BASE_URL || '';

    // Get path for log link
    getPath(locationSlug: string, studentId: number): string {
        return `/v2/admin/${locationSlug}/students/${studentId}`;
    }

    // Gender mapping using enum
    private readonly genderNames: Record<string, string> = {
        [StudentGender.MALE]: 'Male',
        [StudentGender.FEMALE]: 'Female',
    };

    // Field configuration for student change detection
    // Note: status is excluded - it's automatically managed based on enrollment state
    private readonly studentFieldConfig = [
        { key: 'firstName', label: 'first name', showValues: true },
        { key: 'lastName', label: 'last name', showValues: true },
        { key: 'birthDate', label: 'birth date', showValues: false },
        { key: 'gender', label: 'gender', showValues: true, useGenderMap: true },
        { key: 'note', label: 'notes', showValues: false },
    ];

    // Find user by id
    async findUserById(userId: number): Promise<User> {
        try {
            const user = await this.userRepository.findOne({ where: { id: userId }, relations: ['profile'] });
            if (!user) {
                throw new NotFoundException(`User with ID ${userId} not found`);
            }
            return user;
        } catch (error) {
            if (error instanceof NotFoundException || error instanceof BadRequestException) {
                throw error;
            }
            console.error('Error in findUserById service:', error);
            throw new BadRequestException(`Failed to find user: ${error.message}`);
        }
    }

    /**
     * Build change description for student info updates
     * Compares old and new attributes and returns a formatted string
     */
    private getChangeDescription(oldAttrs: any, newAttrs: any): string {
        const changes: string[] = [];

        this.studentFieldConfig.forEach(({ key, label, showValues, useGenderMap }) => {
            const oldVal = oldAttrs[key];
            const newVal = newAttrs[key];

            if (newVal === undefined) return;

            const oldStr = oldVal?.toString() ?? '';
            const newStr = newVal?.toString() ?? '';

            if (oldStr !== newStr) {
                if (showValues) {
                    let oldDisplay = oldVal;
                    let newDisplay = newVal;

                    if (useGenderMap) {
                        oldDisplay = this.genderNames[oldVal] || 'Unknown';
                        newDisplay = this.genderNames[newVal] || 'Unknown';
                    }

                    changes.push(`${label} from "${oldDisplay}" to "${newDisplay}"`);
                } else {
                    changes.push(label);
                }
            }
        });

        return changes.length > 0 ? ` (changed ${changes.join(', ')})` : '';
    }

    /**
     * Build log message based on action type
     */
    private logMessage(
        action: string,
        userName: string,
        studentName: string,
        data?: any,
        programName?: string,
    ): string {
        switch (action) {
            case LogActivityType.TYPE_CREATE:
                return programName
                    ? `${userName} created a ${programName} program examresult for {{${studentName}}}`
                    : `${userName} created new student {{${studentName}}}`;

            case LogActivityType.TYPE_UPDATE:
                if (programName) {
                    return `${userName} updated a ${programName} program examresult for {{${studentName}}}`;
                }
                const changeDescription = data?.oldAttributes && data?.newAttributes
                    ? this.getChangeDescription(data.oldAttributes, data.newAttributes)
                    : '';
                return `${userName} updated student {{${studentName}}}${changeDescription}`;

            case LogActivityType.TYPE_DELETE:
                return programName
                    ? `${userName} deleted ${programName} program examresult for {{${studentName}}}`
                    : `${userName} deleted student {{${studentName}}}`;

            case LogActivityType.TYPE_MERGE:
                const sourceStudentName = data?.sourceStudentName || 'Unknown';
                return `${userName} merged ${sourceStudentName} with {{${studentName}}}`;

            default:
                return `${userName} performed action on {{${studentName}}}`; // default case if action is not found
        }
    }

    /**
     * Create student log
     */
    async createStudentLog(params: StudentLogParams): Promise<void> {
        const { action, studentId, studentName, loggedUserId, locationId, locationSlug, data, programName } = params;

        try {
            const loggedUser = await this.findUserById(loggedUserId);
            const loggedUserProfile = loggedUser.profile;
            const userName = `${loggedUserProfile.firstname} ${loggedUserProfile.lastname}`;

            // Get path
            const path = this.getPath(locationSlug, studentId);

            // Build message based on action type
            const message = this.logMessage(action, userName, studentName, data, programName);

            // Find log object and activity
            const logObject = await this.logObjectRepository.findLogObjectByName('student');
            const logActivity = await this.logActivityRepository.findLogActivityByName(action);

            if (!logObject || !logActivity) {
                throw new NotFoundException('log object or activity not found');
            }

            const logData = {
                logObjectId: logObject?.id,
                logActivityId: logActivity?.id,
                message,
                data: JSON.stringify(data),
                locationId,
                createdOn: new Date(),
                createdUserId: loggedUserId,
            };

            const logLinkData = {
                index: studentName,
                baseUrl: this.baseUrl,
                path,
            };

            const logHistoryData = {
                instanceId: studentId,
                instanceType: logObject?.name,
            };

            // Create log, link, and history
            await this.logRepository.createLog(logData, logLinkData, logHistoryData);

        } catch (error) {
            if (error instanceof NotFoundException || error instanceof BadRequestException) {
                throw error;
            }
            console.error('Error in createStudentInfoLog service:', error);
            throw new BadRequestException(`Failed to create student log: ${error.message}`);
        }
    }
}