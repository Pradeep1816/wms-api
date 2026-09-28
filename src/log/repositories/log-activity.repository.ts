import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { LogActivity } from "../entities/log-activity.entity";

@Injectable()
export class LogActivityRepository {
    constructor(
        @InjectRepository(LogActivity)
        private readonly logActivityRepository: Repository<LogActivity>,
    ) {}

    async findLogActivityByName(name: string): Promise<LogActivity | null> {
        try {
            const logActivity = await this.logActivityRepository.findOne({ where: { name } });
        if (!logActivity) {
                throw new NotFoundException(`Log activity with name ${name} not found`);
            }
            return logActivity;
        } catch (error) {
            console.error('Error in findLogActivityByName repository:', error);
            throw new BadRequestException(`Failed to find log activity: ${error.message}`);
        }
    }
}