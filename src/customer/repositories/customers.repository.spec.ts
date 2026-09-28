import { describe, expect, it, vi } from 'vitest';
import { CustomerListRepository } from './customers.repository';

function fixture() {
  const walkin = {
    id: 900,
    status: 1,
    profile: { firstname: 'Walkin', lastname: 'Customer' },
  };
  const makeQuery = () => {
    const query: Record<string, ReturnType<typeof vi.fn>> = {};
    for (const name of [
      'distinct',
      'leftJoinAndSelect',
      'leftJoin',
      'where',
      'andWhere',
      'orderBy',
      'addOrderBy',
      'skip',
      'take',
      'select',
    ]) {
      query[name] = vi.fn(() => query);
    }
    query.getMany = vi.fn().mockResolvedValue([walkin]);
    query.getRawOne = vi.fn().mockResolvedValue({ count: '1' });
    return query;
  };
  const dataQuery = makeQuery();
  const countQuery = makeQuery();
  const userRepository = {
    createQueryBuilder: vi
      .fn()
      .mockReturnValueOnce(dataQuery)
      .mockReturnValueOnce(countQuery),
  };
  const repository = new CustomerListRepository(
    userRepository as any,
    ...(Array(14).fill({}) as [
      any,
      any,
      any,
      any,
      any,
      any,
      any,
      any,
      any,
      any,
      any,
      any,
      any,
      any,
    ]),
  );
  return { repository, dataQuery, countQuery, walkin };
}

describe('Customers page walk-in visibility', () => {
  it.each([{}, { showActive: true, showInActive: true }])(
    'includes mapped walk-in customers in both results and pagination for All (%j)',
    async (flags) => {
      const { repository, dataQuery, countQuery, walkin } = fixture();
      const result = await repository.findCustomersInLocation(1, {
        firstName: 'walkin',
        ...flags,
      });
      for (const query of [dataQuery, countQuery]) {
        expect(query.andWhere).not.toHaveBeenCalledWith(
          'locationWalkin.customerId IS NULL',
        );
        expect(query.andWhere).toHaveBeenCalledWith(
          'profile.firstname LIKE :firstName',
          { firstName: '%walkin%' },
        );
        expect(query.andWhere).not.toHaveBeenCalledWith(
          'user.status = :active',
          expect.anything(),
        );
        expect(query.andWhere).not.toHaveBeenCalledWith(
          'user.status = :notActive',
          expect.anything(),
        );
      }
      expect(result).toEqual({ customers: [walkin], total: 1 });
    },
  );

  it.each([
    [true, false, 'user.status = :active', { active: 2 }],
    [false, true, 'user.status = :notActive', { notActive: 1 }],
  ])(
    'retains the selected status filter (active=%s, inactive=%s)',
    async (showActive, showInActive, condition, parameters) => {
      const { repository, dataQuery, countQuery } = fixture();
      await repository.findCustomersInLocation(1, {
        showActive: showActive as boolean,
        showInActive: showInActive as boolean,
      });
      for (const query of [dataQuery, countQuery])
        expect(query.andWhere).toHaveBeenCalledWith(condition, parameters);
    },
  );

  it('keeps role, deleted-record and location restrictions in the data and count queries', async () => {
    const { repository, dataQuery, countQuery } = fixture();
    await repository.findCustomersInLocation(7, {
      firstName: 'walkin',
      showInActive: true,
    });
    for (const query of [dataQuery, countQuery]) {
      expect(query.where).toHaveBeenCalledWith(
        'authAssignment.item_name = :role',
        { role: 'customer' },
      );
      expect(query.andWhere).toHaveBeenCalledWith('user.isDeleted = 0');
      expect(query.andWhere).toHaveBeenCalledWith(
        'userLocation.locationId = :locationId',
        { locationId: 7 },
      );
    }
  });
});
