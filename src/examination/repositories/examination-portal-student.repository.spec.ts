import { Repository } from 'typeorm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Student } from '../../student/entities/student.entity';
import { ExaminationPortalStudentRepository } from './examination-portal-student.repository';

describe('ExaminationPortalStudentRepository', () => {
  const rows = [
    {
      firstName: 'Test',
      lastName: 'Student',
      locationSlug: 'training-location',
      locationName: 'Training Location',
    },
  ];
  const queryBuilder = {
    innerJoin: vi.fn(),
    where: vi.fn(),
    andWhere: vi.fn(),
    select: vi.fn(),
    addSelect: vi.fn(),
    orderBy: vi.fn(),
    addOrderBy: vi.fn(),
    getRawMany: vi.fn(),
  };
  const typeOrmRepository = {
    createQueryBuilder: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    for (const method of [
      queryBuilder.innerJoin,
      queryBuilder.where,
      queryBuilder.andWhere,
      queryBuilder.select,
      queryBuilder.addSelect,
      queryBuilder.orderBy,
      queryBuilder.addOrderBy,
    ]) {
      method.mockReturnValue(queryBuilder);
    }
    queryBuilder.getRawMany.mockResolvedValue(rows);
    typeOrmRepository.createQueryBuilder.mockReturnValue(queryBuilder);
  });

  it('constrains the query to the resolved customer, route location, and non-deleted records', async () => {
    const repository = new ExaminationPortalStudentRepository(
      typeOrmRepository as unknown as Repository<Student>,
    );

    await expect(repository.findForCustomerAtLocation(15004, 1)).resolves.toBe(
      rows,
    );
    expect(queryBuilder.where).toHaveBeenCalledWith(
      'student.customerId = :customerId',
      { customerId: 15004 },
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'student.isDeleted = :studentDeleted',
      { studentDeleted: 0 },
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'customer.isDeleted = :customerDeleted',
      { customerDeleted: false },
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'userLocation.locationId = :locationId',
      { locationId: 1 },
    );
  });

  it('selects only fields used by the minimal Education Portal DTO', async () => {
    const repository = new ExaminationPortalStudentRepository(
      typeOrmRepository as unknown as Repository<Student>,
    );

    await repository.findForCustomerAtLocation(15004, 1);

    expect(queryBuilder.select).toHaveBeenCalledWith(
      'student.firstName',
      'firstName',
    );
    expect(queryBuilder.addSelect).toHaveBeenCalledWith(
      'student.lastName',
      'lastName',
    );
    expect(queryBuilder.addSelect).toHaveBeenCalledWith(
      'location.slug',
      'locationSlug',
    );
    expect(queryBuilder.addSelect).toHaveBeenCalledWith(
      'location.name',
      'locationName',
    );
  });
});
