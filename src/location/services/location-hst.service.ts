import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Location } from "../entities/location.entity";
import { Repository } from "typeorm";

@Injectable()
export class LocationHstService {
    constructor(
        @InjectRepository(Location)
        private readonly locationRepository: Repository<Location>,
    ) { }

    async updateHstRegistrationNo(locationId: number, hst: string): Promise<any> {
        const location = await this.locationRepository.findOne({ where: { id: locationId } });
        if (!location) {
            throw new NotFoundException('Location not found');
        }
        await this.locationRepository.update(locationId,
            { hstRegistrationNo: hst.trim() });
        return { success: true };
    }
}   