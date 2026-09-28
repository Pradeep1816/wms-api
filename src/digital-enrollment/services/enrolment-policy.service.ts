import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  CreateEnrolmentPolicyDto,
  ReorderEnrolmentPoliciesDto,
  UpdateEnrolmentPolicyDto,
} from '../dto/enrolment-policy.dto';
import { EnrolmentPolicy } from '../entities/enrolment-policy.entity';
import { EnrolmentPolicyRepository } from '../repositories/enrolment-policy.repository';

export interface EnrolmentPolicyResponseDto {
  id: number;
  title: string;
  content: string;
  sortOrder: number;
  isActive: boolean;
  createdByUser: string | null;
  createdOn: string | null;
  updatedByUser: string | null;
  updatedOn: string | null;
}

export interface PublicEnrolmentPolicyDto {
  id: number;
  title: string;
  content: string;
  sortOrder: number;
}

@Injectable()
export class EnrolmentPolicyService {
  constructor(private readonly policyRepository: EnrolmentPolicyRepository) {}

  async getPolicies(): Promise<{ body: EnrolmentPolicyResponseDto[] }> {
    const policies = await this.policyRepository.findAll();

    return { body: policies.map((policy) => this.toResponse(policy)) };
  }

  async getActivePolicies(): Promise<{ body: PublicEnrolmentPolicyDto[] }> {
    const policies = await this.policyRepository.findActive();

    return {
      body: policies.map((policy) => ({
        id: policy.id,
        title: policy.title,
        content: policy.content,
        sortOrder: policy.sortOrder,
      })),
    };
  }

  /**
   * Point-in-time copy of the policy the customer actually agreed to, stored on
   * the submission so later edits to the policy cannot rewrite what was signed.
   */
  async getActivePolicySnapshot(): Promise<string | null> {
    const policies = await this.policyRepository.findActive();

    if (!policies.length) {
      return null;
    }

    return JSON.stringify(
      policies.map((policy) => ({
        id: policy.id,
        title: policy.title,
        content: policy.content,
        sortOrder: policy.sortOrder,
      })),
    );
  }

  /**
   * The policy a submission was signed against. Submissions made before the
   * policy became editable have no snapshot; for those the current active
   * policy is the closest truth, because it was seeded from the text they saw.
   */
  async resolveSignedPolicySections(
    snapshot: string | null,
  ): Promise<PublicEnrolmentPolicyDto[]> {
    if (snapshot) {
      try {
        const parsed: unknown = JSON.parse(snapshot);

        if (Array.isArray(parsed)) {
          return parsed as PublicEnrolmentPolicyDto[];
        }
      } catch {
        // A corrupt snapshot should not take the whole enrolment PDF down.
      }
    }

    const { body } = await this.getActivePolicies();

    return body;
  }

  async createPolicy(
    userId: number,
    dto: CreateEnrolmentPolicyDto,
  ): Promise<{ body: EnrolmentPolicyResponseDto }> {
    const sortOrder = await this.policyRepository.nextSortOrder();

    const created = await this.policyRepository.createPolicy({
      title: dto.title,
      content: dto.content,
      isActive: dto.isActive ?? true,
      sortOrder,
      userId,
    });

    const hydrated = await this.policyRepository.findById(created.id);

    return { body: this.toResponse(hydrated || created) };
  }

  async updatePolicy(
    id: number,
    userId: number,
    dto: UpdateEnrolmentPolicyDto,
  ): Promise<{ body: EnrolmentPolicyResponseDto }> {
    const policy = await this.policyRepository.findById(id);

    if (!policy) {
      throw new NotFoundException('Enrolment policy not found');
    }

    await this.policyRepository.updatePolicy(policy, {
      title: dto.title,
      content: dto.content,
      isActive: dto.isActive,
      userId,
    });

    const hydrated = await this.policyRepository.findById(id);

    if (!hydrated) {
      throw new NotFoundException('Enrolment policy not found');
    }

    return { body: this.toResponse(hydrated) };
  }

  async reorderPolicies(
    userId: number,
    dto: ReorderEnrolmentPoliciesDto,
  ): Promise<{ body: EnrolmentPolicyResponseDto[] }> {
    const ids = dto.policies.map((policy) => policy.id);
    const uniqueIds = new Set(ids);

    if (uniqueIds.size !== ids.length) {
      throw new BadRequestException('Duplicate policy ids in reorder request');
    }

    const existing = await this.policyRepository.findByIds(ids);

    if (existing.length !== ids.length) {
      throw new BadRequestException('One or more policies do not exist');
    }

    await this.policyRepository.applySortOrder(dto.policies, userId);

    return this.getPolicies();
  }

  async deletePolicy(id: number): Promise<{ body: { id: number } }> {
    const policy = await this.policyRepository.findById(id);

    if (!policy) {
      throw new NotFoundException('Enrolment policy not found');
    }

    await this.policyRepository.deletePolicy(id);

    return { body: { id } };
  }

  private toResponse(policy: EnrolmentPolicy): EnrolmentPolicyResponseDto {
    return {
      id: policy.id,
      title: policy.title,
      content: policy.content,
      sortOrder: policy.sortOrder,
      isActive: Boolean(policy.isActive),
      createdByUser: this.formatUserName(
        policy.createdByUserId,
        policy.createdByUser,
      ),
      // Serialised as UTC. The browser converts to Eastern for display exactly
      // once, via formatEasternDateTime — do not shift the timezone here.
      createdOn: policy.createdOn ? policy.createdOn.toISOString() : null,
      updatedByUser: this.formatUserName(
        policy.updatedByUserId,
        policy.updatedByUser,
      ),
      updatedOn: policy.updatedOn ? policy.updatedOn.toISOString() : null,
    };
  }

  private formatUserName(
    userId: number | null,
    user: { profile?: { firstname?: string; lastname?: string } } | null,
  ): string {
    if (!userId) {
      return 'System';
    }

    if (!user?.profile) {
      return 'Unknown User';
    }

    return (
      `${user.profile.firstname || ''} ${user.profile.lastname || ''}`.trim() ||
      'Unknown User'
    );
  }
}
