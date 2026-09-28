import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Blog } from './entities/blog.entity';
import { BlogService } from './services/blog.service';
import { BlogRepository } from './repositories/blog.repository';
import { BlogController } from './controllers/blog.controller';
import { AuthModule } from 'src/auth/auth.module';
import { LocationModule } from 'src/location/location.module';
@Module({
  imports: [TypeOrmModule.forFeature([Blog]),
    AuthModule,
    LocationModule,
  ],
  controllers: [BlogController],
  providers: [
    BlogService,
    BlogRepository,
  ],
  exports: [],
})
export class BlogModule {}


