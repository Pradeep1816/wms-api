import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TestEmail } from '../entities/test-email.entity';

@Injectable()
export class TestEmailRepository {
  constructor(
    @InjectRepository(TestEmail)
    private readonly repo: Repository<TestEmail>,
  ) {}

  async findAll(
    page: number,
    limit: number
  ) {
    const [items, total] = await this.repo.findAndCount({
      skip: (page - 1) * limit,
      take: limit,
    });

    return { items, total };
  }

  async findById(id: number): Promise<TestEmail | null> {
    return this.repo.findOne({ where: { id } });
  }

  async update(id: number, data: Partial<TestEmail>): Promise<TestEmail | null> {
    await this.repo.update(id, data);
    return this.findById(id);
  }
}
