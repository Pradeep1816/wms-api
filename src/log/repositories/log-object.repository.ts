import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { LogObject } from "../entities/log-object.entity";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

@Injectable()
export class LogObjectRepository {
    constructor(
        @InjectRepository(LogObject)
        private readonly logObjectRepository: Repository<LogObject>,
    ) {}

    async findLogObjectByName(name: string): Promise<LogObject | null> {
        try {
            const logObject = await this.logObjectRepository.findOne({ where: { name } });
        if (!logObject) {
                throw new NotFoundException(`Log object with name ${name} not found`);
            }
            return logObject;
        } catch (error) {
            console.error('Error in findLogObjectByName repository:', error);
            throw new BadRequestException(`Failed to find log object: ${error.message}`);
        }
    }
}       