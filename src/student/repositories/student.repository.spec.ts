import { StudentRepository } from './student.repository';

describe('StudentRepository phone filtering', () => {
  const createQuery = () => ({
    orderBy: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
  });

  const createRepository = () =>
    Object.create(StudentRepository.prototype) as StudentRepository;

  const applyPhoneFilter = (
    repository: StudentRepository,
    query: ReturnType<typeof createQuery>,
    phoneNumber: string,
  ) => {
    const repositoryInternals = repository as unknown as {
      applySearchFilters(
        targetQuery: ReturnType<typeof createQuery>,
        filters: { phoneNumber?: string },
      ): void;
    };
    repositoryInternals.applySearchFilters(query, { phoneNumber });
  };

  it('compares only digits when a formatted phone number is searched', () => {
    const repository = createRepository();
    const query = createQuery();

    applyPhoneFilter(repository, query, '(416) 555-0123');

    expect(query.andWhere).toHaveBeenCalledWith(
      "REGEXP_REPLACE(phones.number, '[^0-9]', '') LIKE :phoneNumber",
      { phoneNumber: '%4165550123%' },
    );
  });

  it('does not add a phone condition when the search contains no digits', () => {
    const repository = createRepository();
    const query = createQuery();

    applyPhoneFilter(repository, query, '()- ');

    expect(query.andWhere).not.toHaveBeenCalled();
  });
});
