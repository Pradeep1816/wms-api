import { Injectable, BadRequestException } from '@nestjs/common';
import { TimelineCreatedUsersRepository } from '../repositories/timeline-created-users.repository';
import { TimelineCreatedUserDto } from '../dto/timeline-created-users-response.dto';
import { AuthService } from '../../auth/services/auth.service';

@Injectable()
export class TimelineCreatedUsersService {
  constructor(
    private readonly timelineCreatedUsersRepository: TimelineCreatedUsersRepository,
    private readonly authService: AuthService,
  ) {}

  
  async getCreatedUsersForTimelineDropdown(
    locationId: number,
    userId: number,
  ): Promise<TimelineCreatedUserDto[]> {
    try {
      const roles = await this.authService.getUserRoles(userId);
      const loggedUserRole = roles[0] ?? '';

      const botUserId = await this.timelineCreatedUsersRepository.getBotUserId();

      const users = await this.timelineCreatedUsersRepository.findCreatedUsers(
        locationId,
        loggedUserRole,
        botUserId,
      );

      const userList: TimelineCreatedUserDto[] = users.map(user => ({
        id: user.id,
        publicIdentity: user.publicIdentity,
      }));

      return userList;
    } catch (error) {
      console.error('Error in getCreatedUsersForTimelineDropdown service:', error);
      throw new BadRequestException(`Failed to retrieve timeline created users: ${error.message}`);
    }
  }
}
