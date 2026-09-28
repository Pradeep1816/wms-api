import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { LocationLegalCorporateNameService } from './location-legal-corporate-name.service';

const createService = (location: { id: number } | null) => {
  const locationRepository = {
    findOne: vi.fn().mockResolvedValue(location),
    update: vi.fn().mockResolvedValue({ affected: 1 }),
  };

  return {
    service: new LocationLegalCorporateNameService(locationRepository as never),
    locationRepository,
  };
};

describe('LocationLegalCorporateNameService', () => {
  it('trims and updates the legal corporate name', async () => {
    const { service, locationRepository } = createService({ id: 12 });

    const result = await service.updateLegalCorporateName(
      12,
      '  245789 Ontario Inc. o/a Arcadia Academy of Music  ',
    );

    expect(locationRepository.findOne).toHaveBeenCalledWith({
      where: { id: 12, isDeleted: false },
    });
    expect(locationRepository.update).toHaveBeenCalledWith(12, {
      legalCorporateName: '245789 Ontario Inc. o/a Arcadia Academy of Music',
    });
    expect(result).toEqual({
      legalCorporateName: '245789 Ontario Inc. o/a Arcadia Academy of Music',
    });
  });

  it('stores null when the field is cleared', async () => {
    const { service, locationRepository } = createService({ id: 12 });

    const result = await service.updateLegalCorporateName(12, '   ');

    expect(locationRepository.update).toHaveBeenCalledWith(12, {
      legalCorporateName: null,
    });
    expect(result).toEqual({ legalCorporateName: '' });
  });

  it('rejects missing or deleted locations', async () => {
    const { service, locationRepository } = createService(null);

    await expect(
      service.updateLegalCorporateName(99, 'Legal Name'),
    ).rejects.toThrow(new NotFoundException('Location not found'));
    expect(locationRepository.update).not.toHaveBeenCalled();
  });
});
