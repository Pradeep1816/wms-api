import { beforeEach, describe, expect, it } from 'vitest';
import { ProgramPresentationService } from './program-presentation.service';
import { PricingCategoryEnum } from '../enums/pricing-category.enum';
import { PricingResolutionErrorCode } from '../errors/pricing-resolution.error';
import { Program } from '../../program/entities/program.entity';

const program = (overrides: Partial<Program>): Program =>
  ({
    id: 1,
    name: 'Piano Core',
    publicName: null,
    pricingCategory: null,
    ...overrides,
  }) as Program;

describe('ProgramPresentationService', () => {
  let service: ProgramPresentationService;

  beforeEach(() => {
    service = new ProgramPresentationService();
  });

  describe('public name', () => {
    it('uses publicName when it is set', () => {
      expect(
        service.publicNameFor(
          program({ name: 'xVocal Core', publicName: 'Vocal Core' }),
        ),
      ).toBe('Vocal Core');
    });

    it('strips the x prefix on old-pricing programs when publicName is missing', () => {
      // 32 active programs carry this prefix. None of them should reach a
      // customer's invoice looking like that.
      expect(service.publicNameFor(program({ name: 'xVocal Core' }))).toBe(
        'Vocal Core',
      );
      expect(service.publicNameFor(program({ name: 'xPiano Core' }))).toBe(
        'Piano Core',
      );
    });

    it('strips the interim marker used for September programs', () => {
      expect(service.publicNameFor(program({ name: '_Flute' }))).toBe('Flute');
      expect(service.publicNameFor(program({ name: '/Flute' }))).toBe('Flute');
    });

    it('does not eat the first letter of a genuine word', () => {
      // The prefix is a lowercase x followed by a capital. A real instrument
      // starting with X must survive intact.
      expect(service.publicNameFor(program({ name: 'Xylophone' }))).toBe(
        'Xylophone',
      );
      expect(service.publicNameFor(program({ name: 'xylophone' }))).toBe(
        'xylophone',
      );
    });

    it('prefers an explicit publicName even when the internal name looks clean', () => {
      expect(
        service.publicNameFor(
          program({ name: 'Piano Core', publicName: 'Piano' }),
        ),
      ).toBe('Piano');
    });

    it('ignores a blank publicName rather than showing an empty name', () => {
      expect(
        service.publicNameFor(program({ name: 'xFlute', publicName: '   ' })),
      ).toBe('Flute');
    });
  });

  describe('internal marker detection', () => {
    it.each([['xPiano Core'], ['_Flute'], ['/Flute']])('flags %s', (name) => {
      expect(service.hasInternalMarker(program({ name }))).toBe(true);
    });

    it('does not flag an ordinary name', () => {
      expect(service.hasInternalMarker(program({ name: 'Piano Core' }))).toBe(
        false,
      );
    });

    // The rule used to be /^[x_/]/i, which called this a marker. Harmless
    // while it only chose a label; not harmless now that isTierable reads it.
    it('does not flag an instrument that merely begins with x', () => {
      expect(service.hasInternalMarker(program({ name: 'Xylophone' }))).toBe(
        false,
      );
    });
  });

  describe('tierability', () => {
    it('offers tiers on an ordinary classified program', () => {
      expect(
        service.isTierable(
          program({ name: 'Piano Core', pricingCategory: 'standard' }),
        ),
      ).toBe(true);
    });

    // The whole point of the change. These 32 programs exist to hold the 2018
    // sheet at $57.50; quoting a September tier on one would charge the newest
    // price from the program whose purpose is to preserve the oldest.
    it.each([['xPiano Core'], ['xVocal Core'], ['_Flute'], ['/Flute']])(
      'refuses tiers on %s even though it is classified',
      (name) => {
        expect(
          service.isTierable(program({ name, pricingCategory: 'standard' })),
        ).toBe(false);
      },
    );

    it('still refuses tiers on an unclassified program', () => {
      expect(
        service.isTierable(program({ name: 'Band', pricingCategory: null })),
      ).toBe(false);
    });

    // isClassified is what the marker programs pass, which is exactly why
    // tierability had to become a separate question rather than a rename.
    it('is narrower than classification, not a synonym for it', () => {
      const legacy = program({
        name: 'xPiano Core',
        pricingCategory: 'standard',
      });

      expect(service.isClassified(legacy)).toBe(true);
      expect(service.isTierable(legacy)).toBe(false);
    });

    it('offers tiers on a genuine x-instrument', () => {
      expect(
        service.isTierable(
          program({ name: 'Xylophone', pricingCategory: 'standard' }),
        ),
      ).toBe(true);
    });
  });

  describe('pricing category', () => {
    it.each([
      ['standard', PricingCategoryEnum.STANDARD],
      ['vocal', PricingCategoryEnum.VOCAL],
      ['VOCAL', PricingCategoryEnum.VOCAL],
      [' vocal ', PricingCategoryEnum.VOCAL],
    ])('reads %s', (stored, expected) => {
      expect(
        service.pricingCategoryFor(program({ pricingCategory: stored })),
      ).toBe(expected);
    });

    it('fails closed on an unclassified program rather than guessing', () => {
      // Harmonium is the reason. It sits at 72.50/hr, the same as the vocal
      // programs, so anything inferring category from rate would price it as
      // vocal - 160.00 instead of 145.00, an over-charge on a real invoice.
      expect(() =>
        service.pricingCategoryFor(program({ id: 108, name: 'Harmonium' })),
      ).toThrowError(
        expect.objectContaining({
          code: PricingResolutionErrorCode.INVALID_INPUT,
        }),
      );
    });

    it('fails closed on an unrecognised value', () => {
      expect(() =>
        service.pricingCategoryFor(program({ pricingCategory: 'premium' })),
      ).toThrowError(
        expect.objectContaining({
          code: PricingResolutionErrorCode.INVALID_INPUT,
        }),
      );
    });

    it('reports classification without throwing', () => {
      expect(service.isClassified(program({ pricingCategory: 'vocal' }))).toBe(
        true,
      );
      expect(service.isClassified(program({ pricingCategory: null }))).toBe(
        false,
      );
      expect(
        service.isClassified(program({ pricingCategory: 'premium' })),
      ).toBe(false);
    });
  });
});
