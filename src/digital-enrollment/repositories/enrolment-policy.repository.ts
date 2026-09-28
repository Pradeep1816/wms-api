import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { EnrolmentPolicy } from '../entities/enrolment-policy.entity';

const auditRelations = [
  'createdByUser',
  'createdByUser.profile',
  'updatedByUser',
  'updatedByUser.profile',
];

@Injectable()
export class EnrolmentPolicyRepository {
  constructor(
    @InjectRepository(EnrolmentPolicy)
    private readonly repository: Repository<EnrolmentPolicy>,
  ) {}

  findAll(): Promise<EnrolmentPolicy[]> {
    return this.repository.find({
      relations: auditRelations,
      order: { sortOrder: 'ASC', id: 'ASC' },
    });
  }

  findActive(): Promise<EnrolmentPolicy[]> {
    return this.repository.find({
      where: { isActive: true },
      order: { sortOrder: 'ASC', id: 'ASC' },
    });
  }

  findById(id: number): Promise<EnrolmentPolicy | null> {
    return this.repository.findOne({
      where: { id },
      relations: auditRelations,
    });
  }

  findByIds(ids: number[]): Promise<EnrolmentPolicy[]> {
    return this.repository.find({ where: { id: In(ids) } });
  }

  async nextSortOrder(): Promise<number> {
    const last = await this.repository.findOne({
      where: {},
      order: { sortOrder: 'DESC' },
    });

    return last ? last.sortOrder + 1 : 0;
  }

  async createPolicy(params: {
    title: string;
    content: string;
    isActive: boolean;
    sortOrder: number;
    userId: number;
  }): Promise<EnrolmentPolicy> {
    // `new Date()` is UTC-based and the MySQL connection runs with timezone 'Z',
    // so this is stored as UTC and serialised back out as UTC.
    const now = new Date();

    return this.repository.save(
      this.repository.create({
        title: params.title,
        content: params.content,
        isActive: params.isActive,
        sortOrder: params.sortOrder,
        createdByUserId: params.userId,
        updatedByUserId: params.userId,
        createdOn: now,
        updatedOn: now,
      }),
    );
  }

  async updatePolicy(
    policy: EnrolmentPolicy,
    params: {
      title?: string;
      content?: string;
      isActive?: boolean;
      userId: number;
    },
  ): Promise<EnrolmentPolicy> {
    if (params.title !== undefined) {
      policy.title = params.title;
    }

    if (params.content !== undefined) {
      policy.content = params.content;
    }

    if (params.isActive !== undefined) {
      policy.isActive = params.isActive;
    }

    policy.updatedByUserId = params.userId;
    policy.updatedOn = new Date();

    return this.repository.save(policy);
  }

  async applySortOrder(
    updates: Array<{ id: number; sortOrder: number }>,
    userId: number,
  ): Promise<void> {
    const now = new Date();

    await this.repository.manager.transaction(async (manager) => {
      for (const update of updates) {
        await manager.update(EnrolmentPolicy, update.id, {
          sortOrder: update.sortOrder,
          updatedByUserId: userId,
          updatedOn: now,
        });
      }
    });
  }

  async deletePolicy(id: number): Promise<void> {
    await this.repository.delete(id);
  }
}
