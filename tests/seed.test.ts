import { describe, expect, it } from 'vitest';
import { stateSchema } from '../src/lib/model';
import { createSeed } from '../src/lib/seed';

describe('fictional bilingual seed', () => {
  it('parses as a complete community state with nine unique active sports', () => {
    const seed = createSeed();
    expect(stateSchema.safeParse(seed).success).toBe(true);
    expect(seed.sports).toHaveLength(9);
    expect(new Set(seed.sports.map(sport => sport.id)).size).toBe(9);
    expect(seed.sports.every(sport => sport.active)).toBe(true);
  });

  it('has English and Italian text for every public guide and venue field', () => {
    const seed = createSeed();
    const translated = [
      ...seed.sports.flatMap(sport => [sport.name, sport.overview, sport.rules, sport.equipment, sport.safety]),
      ...seed.venues.flatMap(venue => [venue.area, venue.price, venue.access, venue.hours, venue.accessibility]),
    ];
    for (const value of translated) {
      expect(Object.keys(value).sort()).toEqual(['en', 'it']);
      expect(value.en.trim().length).toBeGreaterThan(0);
      expect(value.it.trim().length).toBeGreaterThan(0);
    }
  });
});
