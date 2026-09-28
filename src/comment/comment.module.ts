import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Note } from './entities/notes.entity';
import { CommentRepository } from './repositories/comment.repository';
import { CommentService } from './services/comment.service';
import { CommentTransformationService } from './services/transformations/comment-transformation.service';
import { UserModule } from '../user/user.module';
import { Location } from '../location/entities/location.entity';
import { User } from '../user/entities/user.entity';
import { CommentController } from './controllers/comment.controller';
import { LocationModule } from '../location/location.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Note, Location, User]),
    UserModule,
    LocationModule,
    AuthModule,
  ],
  controllers: [CommentController],
  providers: [CommentRepository, CommentService, CommentTransformationService],
  exports: [CommentService, CommentRepository],
})
export class CommentModule {}
