import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReleaseNotes } from './entities/release-notes.entity';
import { ReleaseNotesRead } from './entities/release-notes-read.entity';
import { ReleaseNotesRepository } from './repositories/release-notes.repository';
import { ReleaseNotesService } from './services/release-notes.service';
import { ReleaseNotesController } from './controllers/release-notes.controller';
import { AuthModule } from '../auth/auth.module';
import { LocationModule } from '../location/location.module';
import { ReleaseNotesTransformationService } from './services/transformation/release-notes-transformation.service';
import { User } from '../user/entities/user.entity';
@Module({
  imports: [
    TypeOrmModule.forFeature([ReleaseNotes, ReleaseNotesRead, User]),
    LocationModule,
    AuthModule,
  ],
  controllers: [ReleaseNotesController],
  providers: [
    ReleaseNotesService,
    ReleaseNotesRepository,
    ReleaseNotesTransformationService,
  ],
})
export class ReleaseNotesModule {}
