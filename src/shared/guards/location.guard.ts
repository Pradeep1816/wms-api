import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common';
import { LocationService } from '../../location/services/location.service';

@Injectable()
export class LocationResolveGuard implements CanActivate {
  constructor(private readonly locationService: LocationService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const slug: string | undefined = request.params?.location;

    if (!slug) {
      return true;
    }

    const locationId = await this.locationService.getLocationId(slug);
    if (!locationId) {
      throw new NotFoundException(`Location with slug '${slug}' not found`);
    }
    request.location = { id: locationId, slug };
    return true;
  }
}


