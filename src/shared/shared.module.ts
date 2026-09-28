import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import configuration from '../config/configuration';
import { LocationModule } from '../location/location.module';
import { LocationResolveGuard } from './guards/location.guard';
import { TeamsAlertService } from './services/teams-alert.service';
import { AuditTrailModule } from '../audit-trail/audit-trail.module';
import { AuditTrailSubscriber } from '../audit-trail/subscribers/audit-trail.subscriber';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: ['.env.local', '.env'],
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        type: 'mysql',
        host: configService.get<string>('database.host'),
        port: configService.get<number | undefined>('database.port'),
        database: configService.get<string>('database.name'),
        username: configService.get<string>('database.user'),
        password: configService.get<string>('database.pass'),
        entities: [__dirname + '/../**/*.entity{.ts,.js}'],
        timezone: 'Z',
        synchronize: false,
        autoLoadEntities: true,
        subscribers: [AuditTrailSubscriber],
        debug: false,

        retryAttempts: 10,
        retryDelay: 3000,
        keepConnectionAlive: true,
        connectTimeout: 60000,
        timeout: 60000,
      }),
    }),
    LocationModule,
    AuditTrailModule,
  ],
  controllers: [],
  exports: [ConfigModule, LocationResolveGuard, LocationModule, TeamsAlertService],
  providers: [ConfigService, LocationResolveGuard, TeamsAlertService],
})
export class SharedModule {}
