import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isArcadiaExaminationsEnabled } from '../../shared/helpers/arcadia-examinations-rollout.helper';

@Injectable()
export class ArcadiaExaminationsRolloutGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      params?: { location?: string };
      location?: { slug?: string };
    }>();
    const location = request.location?.slug ?? request.params?.location;

    if (!isArcadiaExaminationsEnabled(location)) {
      throw new NotFoundException({
        success: false,
        errorCode: 'EXAMINATIONS_NOT_AVAILABLE',
        message: 'Arcadia Examinations is not available for this location.',
      });
    }

    return true;
  }
}
