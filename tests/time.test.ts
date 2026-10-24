import { describe, expect, it } from 'vitest';
import { localDateInput, wallTimeToISO } from '../src/lib/time';

describe('community wall time conversion', () => {
  it('converts ordinary Rome winter and summer dates with their actual offsets', () => {
    expect(wallTimeToISO('2026-01-15T12:30', 'Europe/Rome')).toBe('2026-01-15T11:30:00.000Z');
    expect(wallTimeToISO('2026-07-15T12:30', 'Europe/Rome')).toBe('2026-07-15T10:30:00.000Z');
  });

  it('rejects a nonexistent Rome spring DST wall time', () => {
    expect(() => wallTimeToISO('2026-03-29T02:30', 'Europe/Rome')).toThrow();
  });

  it('round-trips an existing wall time across fall DST', () => {
    const instant = wallTimeToISO('2026-10-25T02:30', 'Europe/Rome');
    expect(localDateInput(new Date(instant), 'Europe/Rome')).toBe('2026-10-25T02:30');
  });

  it('rejects malformed and impossible dates', () => {
    expect(() => wallTimeToISO('2026-02-30T12:00', 'Europe/Rome')).toThrow();
    expect(() => wallTimeToISO('2026-01-15 12:00', 'Europe/Rome')).toThrow();
  });
});
