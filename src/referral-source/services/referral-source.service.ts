import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ReferralSourceRepository } from '../repositories/referral-source.repository';
import { ReferralSourceDto } from '../dto/referral-source.dto';
import { CreateReferralSourceRequestDto } from '../dto/create-referral-source-request.dto';
import { UpdateReferralSourceRequestDto } from '../dto/update-referral-source-request.dto';
import { ReferralSource } from '../entities/referral-source.entity';


@Injectable()
export class ReferralSourceService {
  constructor(
    private readonly referralSourceRepository: ReferralSourceRepository,
  ) {}

  /**
   * Get all active referral sources
   * @returns Array of referral source DTOs
   */
  async getReferralSources( 
    sort: string = 'name',
    order: 'ASC' | 'DESC' = 'ASC'): Promise<ReferralSourceDto[]> {
    try {
      // Get referral sources using repository
      const referralSources = await this.referralSourceRepository.getActiveReferralSources(sort, order);

      return referralSources.map(source => ({
        id: source.id,
        name: source.name,
      }));
    } catch (error) {
      console.error('Error in getReferralSources service:', error);
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Failed to retrieve referral sources: ${error.message}`);
    }
  }
  async createReferralSource(
  userId: number,
  createDto: CreateReferralSourceRequestDto,
) {
  try {

    const referralSource =
      await this.referralSourceRepository.createReferralSource(
        createDto,
        userId,
      );

    const response: any = {
      id: referralSource.id,
      name: referralSource.name,
      createdByUserId: userId,
    };

    return response;

  } catch (error) {
    console.error('Error in createReferralSource service:', error);

    if (
      error instanceof NotFoundException ||
      error instanceof BadRequestException
    ) {
      throw error;
    }

    throw new BadRequestException('Failed to create referral source');
  }
}

async updateReferralSource(
  id:number,
  userId:number,
  updateDto:UpdateReferralSourceRequestDto
){
  if (id === ReferralSource.REFERRAL_SOURCE_OTHER) {
    throw new BadRequestException('This referral source cannot be modified from Backend.');
  }

  try{
    const updatedReferralSource = 
    await this.referralSourceRepository.updateReferralSource(
      id,
      userId, 
      updateDto
     );
     return{
      id:updatedReferralSource.id,
      name:updatedReferralSource.name,
      updatedByUserId:userId,
    
     };

  }catch(error){
    console.error('Error in update ReferralSource service:', error);
    if (error instanceof BadRequestException) {
      throw error;
    }
    throw new BadRequestException(error.message);
  }
}
async deleteReferralSource(
  id: number,
  userId: number,
) {
  try {
    const deletedResult =
      await this.referralSourceRepository.deleteReferralSource(
        id,
        userId,
      );

    if (!deletedResult || !deletedResult.id) {
      throw new BadRequestException('Failed to delete referral source');
    }

    return {
      id: deletedResult.id,
      name: deletedResult.name,
      deletedByUserId: userId,
 
    };

  } catch (error) {
    console.error('Error in deleteReferralSource service:', error);

    if (
      error instanceof NotFoundException ||
      error instanceof BadRequestException
    ) {
      throw error;
    }

    throw new BadRequestException('Failed to delete referral source');
  }
}

}

    