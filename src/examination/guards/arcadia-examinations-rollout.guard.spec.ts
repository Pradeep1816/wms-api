import { ExecutionContext, NotFoundException } from '@nestjs/common';
import { afterEach, describe, expect, it } from 'vitest';
import { ArcadiaExaminationsRolloutGuard } from './arcadia-examinations-rollout.guard';

describe('ArcadiaExaminationsRolloutGuard', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const guard = new ArcadiaExaminationsRolloutGuard();

  const contextFor = (location: string): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ params: { location } }),
      }),
    }) as ExecutionContext;

  afterEach(() => {
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  it('allows every valid route location outside production', () => {
    process.env.NODE_ENV = 'development';

    expect(guard.canActivate(contextFor('burlington'))).toBe(true);
  });

  it('allows Training Location in production', () => {
    process.env.NODE_ENV = 'production';

    expect(guard.canActivate(contextFor('training-location'))).toBe(true);
  });

  it('returns the stable not-available error for another production location', () => {
    process.env.NODE_ENV = 'production';

    expect(() => guard.canActivate(contextFor('burlington'))).toThrowError(
      expect.objectContaining<Partial<NotFoundException>>({
        response: {
          success: false,
          errorCode: 'EXAMINATIONS_NOT_AVAILABLE',
          message: 'Arcadia Examinations is not available for this location.',
        },
      }),
    );
  });
});
