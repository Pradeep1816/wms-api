import { Controller, Get } from '@nestjs/common';
import { HealthCheckService, HealthCheck, TypeOrmHealthIndicator } from '@nestjs/terminus';

@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private db: TypeOrmHealthIndicator,
  ) {}

  @Get('livez')
  livez() {
    return { status: 'ok' };
  }

  @Get()
  @HealthCheck()
  check() {
    return this.readyz();
  }

  @Get('readyz')
  @HealthCheck()
  readyz() {
    return this.health.check([
      () => this.db.pingCheck('database'),
    ]);
  }
}
