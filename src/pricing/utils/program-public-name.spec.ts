import { afterEach, describe, expect, it } from 'vitest';
import {
  publicProgramName,
  setPublicNameLocations,
  getPublicNameLocations,
} from './program-public-name';

describe('publicProgramName', () => {
  it('prefers an explicit public name', () => {
    expect(
      publicProgramName({ name: 'xVocal Core', publicName: 'Vocal Core' }),
    ).toBe('Vocal Core');
  });

  describe('strips markers that must never reach a customer or instructor', () => {
    it.each([
      ['xVocal Core', 'Vocal Core'],
      ['xPiano Core', 'Piano Core'],
      ['xBass Guitar', 'Bass Guitar'],
      ['_Flute', 'Flute'],
      ['/Flute', 'Flute'],
    ])('%s becomes %s', (internal, expected) => {
      expect(publicProgramName({ name: internal })).toBe(expected);
    });
  });

  describe('leaves genuine names alone', () => {
    it.each([
      ['Piano Core'],
      ['Xylophone'],
      ['xylophone'],
      ['Vocal Plus'],
      ['Level 5 Theory'],
    ])('%s is unchanged', (name) => {
      expect(publicProgramName({ name })).toBe(name);
    });
  });

  describe('degrades safely rather than showing something wrong', () => {
    it.each([
      [null, null],
      [undefined, null],
      [{}, null],
      [{ name: null }, null],
      [{ name: '' }, null],
      [{ name: '   ' }, null],
    ])('%s yields null', (input, expected) => {
      expect(publicProgramName(input as never)).toBe(expected);
    });

    it('falls back to the internal name when publicName is blank', () => {
      expect(publicProgramName({ name: 'xFlute', publicName: '  ' })).toBe(
        'Flute',
      );
    });
  });
});

/**
 * The location gate, added 2026-08-18.
 *
 * Arcadia was told the two pilot locations are the only ones that see any
 * change from the September work. Correcting the program name on an invoice is
 * a change, and 217 active enrolments across seven non-pilot locations sit on a
 * marker program - so the correction is held to the pilot until the rollout
 * widens.
 */
describe('the location gate', () => {
  afterEach(() => {
    // Module state. Leaving it set would silently change every later test.
    setPublicNameLocations(null);
  });

  const legacy = { name: 'xPiano Core', publicName: 'Piano Core' };

  it('is off by default, so every location gets the corrected name', () => {
    expect(getPublicNameLocations()).toBeNull();
    expect(publicProgramName(legacy, 999)).toBe('Piano Core');
  });

  it('shows the corrected name inside the pilot', () => {
    setPublicNameLocations([1, 15]);
    expect(publicProgramName(legacy, 1)).toBe('Piano Core');
    expect(publicProgramName(legacy, 15)).toBe('Piano Core');
  });

  it('keeps the internal name outside the pilot', () => {
    setPublicNameLocations([1, 15]);
    // Bolton - 175 enrolments, the largest non-pilot population.
    expect(publicProgramName(legacy, 4)).toBe('xPiano Core');
  });

  // The default matters more than it looks. A call site that forgets to pass a
  // location fails toward the corrected name - "a customer at Bolton stops
  // seeing an x", not "a customer at Burlington starts seeing one". The second
  // is the defect this helper exists to prevent.
  it('falls back to the corrected name when no location is given', () => {
    setPublicNameLocations([1, 15]);
    expect(publicProgramName(legacy)).toBe('Piano Core');
    expect(publicProgramName(legacy, null)).toBe('Piano Core');
    expect(publicProgramName(legacy, undefined)).toBe('Piano Core');
  });

  it('leaves an ordinary program alone at every location', () => {
    setPublicNameLocations([1, 15]);
    const ordinary = { name: 'Piano Core', publicName: 'Piano Core' };
    expect(publicProgramName(ordinary, 4)).toBe('Piano Core');
    expect(publicProgramName(ordinary, 1)).toBe('Piano Core');
  });

  // Xylophone is an instrument, not a marker, so it reads the same either side
  // of the gate.
  it('does not treat an x-instrument as gated', () => {
    setPublicNameLocations([1, 15]);
    expect(publicProgramName({ name: 'Xylophone', publicName: null }, 4)).toBe(
      'Xylophone',
    );
  });

  it('returns the internal name even when publicName is missing', () => {
    setPublicNameLocations([1, 15]);
    expect(publicProgramName({ name: 'xFlute', publicName: null }, 4)).toBe(
      'xFlute',
    );
  });

  it('still returns null for a program with no name at all', () => {
    setPublicNameLocations([1, 15]);
    expect(publicProgramName({ name: '', publicName: null }, 4)).toBeNull();
    expect(publicProgramName(null, 4)).toBeNull();
  });

  it('can be turned off again', () => {
    setPublicNameLocations([1, 15]);
    expect(publicProgramName(legacy, 4)).toBe('xPiano Core');
    setPublicNameLocations(null);
    expect(publicProgramName(legacy, 4)).toBe('Piano Core');
  });
});
