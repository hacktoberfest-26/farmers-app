import { describe, expect, it } from 'vitest';
import type { CommunityState, Profile, Session, Sport, Venue } from '../src/lib/model';
import { applyCommand, canMessage, isBlocked, matchPeople, visibleSessions } from '../src/lib/policy';

const now = new Date('2026-10-24T12:00:00Z');
const person = (id: string, changes: Partial<Profile> = {}): Profile => ({
  id, name: `Person ${id}`, bio: '', area: 'Roncade', avatar: '', color: '#123456',
  sports: { tennis: 'beginner' }, favorites: [], availability: [{ day: 6, start: '10:00', end: '12:00' }],
  exceptions: [], goals: ['social'], discoverable: true, role: 'member', adult: true,
  onboarded: true, locale: 'en', timezone: 'Europe/Rome', ...changes,
});
const sport: Sport = { id: 'tennis', name: { en: 'Tennis', it: 'Tennis' }, emoji: '🎾', color: '#fff',
  active: true, formats: ['singles'], minPlayers: 2, maxPlayers: 4,
  overview: { en: '', it: '' }, rules: { en: '', it: '' }, equipment: { en: '', it: '' }, safety: { en: '', it: '' } };
const venue: Venue = { id: 'court', name: 'Court', area: { en: '', it: '' }, address: '', campus: false,
  sports: ['tennis'], price: { en: '', it: '' }, access: { en: '', it: '' }, hours: { en: '', it: '' },
  accessibility: { en: '', it: '' }, bookingUrl: '', verifiedAt: null, lat: 0, lng: 0 };
const session = (changes: Partial<Session> = {}): Session => ({ id: 's1', sportId: 'tennis', organizerId: 'a', title: 'Tennis game',
  description: '', date: '2026-10-25T12:00:00Z', duration: 60, venueId: 'court', format: 'singles',
  capacity: 2, skill: 'all', visibility: 'community', approval: false, participants: ['a'], pending: [], waitlist: [],
  invited: [], status: 'open', booking: 'not-booked', createdAt: now.toISOString(), ...changes });
const state = (changes: Partial<CommunityState> = {}): CommunityState => ({ version: 1, viewerId: 'a',
  profiles: [person('a'), person('b'), person('c')], sports: [sport], venues: [venue], sessions: [session()],
  connections: [], messages: [], comments: [], notifications: [], announcements: [], reports: [], blocks: [],
  saved: [], likes: [], settings: { name: 'Community', description: '', weights: { sports: 1, availability: 1, skill: 1, community: 1, goals: 1 } }, ...changes });

describe('pure community policy', () => {
  it('keeps joins idempotent, waitlists at capacity and promotes a waiter after leave', () => {
    const joined = applyCommand(state({ viewerId: 'b' }), { type: 'session.join', id: 's1' }, now);
    expect(joined.sessions[0].participants).toEqual(['a', 'b']);
    expect(applyCommand(joined, { type: 'session.join', id: 's1' }, now)).toBe(joined);
    const waiting = applyCommand({ ...joined, viewerId: 'c' }, { type: 'session.join', id: 's1' }, now);
    expect(waiting.sessions[0].waitlist).toEqual(['c']);
    const left = applyCommand({ ...waiting, viewerId: 'b' }, { type: 'session.leave', id: 's1' }, now);
    expect(left.sessions[0].participants).toEqual(['a', 'c']);
    expect(left.sessions[0].waitlist).toEqual([]);
  });

  it('requires approval without letting it exceed capacity', () => {
    const initial = state({ sessions: [session({ approval: true, pending: ['b', 'c'] })] });
    const approved = applyCommand(initial, { type: 'session.approve', id: 's1', userId: 'b' }, now);
    expect(approved.sessions[0].participants).toEqual(['a', 'b']);
    expect(() => applyCommand(approved, { type: 'session.approve', id: 's1', userId: 'c' }, now)).toThrow('full');
  });

  it('checks invitation, guest and pending eligibility', () => {
    const initial = state({ profiles: [person('a'), person('b', { role: 'guest' }), person('c', { role: 'pending' })],
      sessions: [session({ visibility: 'members' }), session({ id: 'invite', visibility: 'invitation', invited: ['b'] })] });
    expect(visibleSessions(initial, initial.profiles[1]).map(x => x.id)).toEqual(['invite']);
    expect(visibleSessions(initial, initial.profiles[2])).toEqual([]);
    expect(() => applyCommand({ ...initial, viewerId: 'c' }, { type: 'session.join', id: 'invite' }, now)).toThrow();
  });

  it('requires an accepted connection and blocks both directions', () => {
    const initial = state({ connections: [{ id: 'ab', from: 'a', to: 'b', status: 'accepted' }] });
    expect(canMessage(initial, 'b', 'a')).toBe(true);
    const blocked = applyCommand(initial, { type: 'user.block', userId: 'b' }, now);
    expect(isBlocked(blocked, 'b', 'a')).toBe(true);
    expect(canMessage(blocked, 'b', 'a')).toBe(false);
    expect(() => applyCommand({ ...blocked, viewerId: 'b' }, { type: 'message.send', userId: 'a', body: 'Hi' }, now)).toThrow();
  });

  it('prevents membership escalation and unauthorized administration', () => {
    expect(() => applyCommand(state(), { type: 'profile.save', profile: person('a', { role: 'admin' }) }, now)).toThrow();
    expect(() => applyCommand(state(), { type: 'admin.member', userId: 'b', role: 'guest' }, now)).toThrow();
    const elevated = state({ profiles: [person('a', { role: 'admin' }), person('b'), person('c')] });
    expect(applyCommand(elevated, { type: 'admin.member', userId: 'b', role: 'guest' }, now).profiles[1].role).toBe('guest');
  });

  it('rejects past sessions and invalid format, and protects the organizer', () => {
    expect(() => applyCommand(state(), { type: 'session.leave', id: 's1' }, now)).toThrow('Organizer');
    expect(() => applyCommand(state({ sessions: [] }), { type: 'session.create', session: session({ date: '2026-10-23T12:00:00Z' }) }, now)).toThrow('future');
    expect(() => applyCommand(state({ sessions: [] }), { type: 'session.create', session: session({ format: 'doubles' }) }, now)).toThrow('format');
  });

  it('normalizes configured weights and avoids false timezone overlap', () => {
    const initial = state({ profiles: [person('a'), person('b', { timezone: 'America/New_York' })],
      settings: { name: '', description: '', weights: { sports: 0, availability: 10, skill: 0, community: 0, goals: 0 } } });
    expect(matchPeople(initial, initial.profiles[0])[0].overlap).toBe(0);
    expect(matchPeople(initial, initial.profiles[0])[0].score).toBe(0);
    const zeros = { ...initial, settings: { ...initial.settings, weights: { sports: 0, availability: 0, skill: 0, community: 0, goals: 0 } } };
    expect(matchPeople(zeros, zeros.profiles[0])[0].score).toBe(0);
  });

  it('counts overlapping availability slots only once per day', () => {
    const initial = state({ profiles: [
      person('a', { availability: [
        { day: 6, start: '10:00', end: '12:00' }, { day: 6, start: '11:00', end: '13:00' },
      ] }),
      person('b', { availability: [
        { day: 6, start: '11:30', end: '12:30' }, { day: 6, start: '12:00', end: '13:00' },
      ] }),
    ] });
    expect(matchPeople(initial, initial.profiles[0])[0].overlap).toBe(90);
  });

  it('enforces session skill on joining, approval, and waitlist promotion', () => {
    const people = [person('a'), person('b', { sports: { tennis: 'beginner' } }),
      person('c', { sports: { tennis: 'advanced' } })];
    const strict = state({ profiles: people, sessions: [session({ skill: 'intermediate' })] });
    expect(() => applyCommand({ ...strict, viewerId: 'b' }, { type: 'session.join', id: 's1' }, now)).toThrow('unavailable');
    expect(applyCommand({ ...strict, viewerId: 'c' }, { type: 'session.join', id: 's1' }, now).sessions[0].participants).toEqual(['a', 'c']);
    const stalePending = state({ profiles: people, sessions: [session({ skill: 'intermediate', approval: true, pending: ['b'] })] });
    expect(() => applyCommand(stalePending, { type: 'session.approve', id: 's1', userId: 'b' }, now)).toThrow('unavailable');
    const inactive = state({ profiles: people, sports: [{ ...sport, active: false }] });
    expect(() => applyCommand({ ...inactive, viewerId: 'c' }, { type: 'session.join', id: 's1' }, now)).toThrow('unavailable');
  });

  it('limits outgoing pending requests to ten', () => {
    const initial = state({ profiles: [person('a'), ...Array.from({ length: 11 }, (_, i) => person(`p${i}`))],
      connections: Array.from({ length: 10 }, (_, i) => ({ id: `c${i}`, from: 'a', to: `p${i}`, status: 'pending' as const })) });
    expect(() => applyCommand(initial, { type: 'connection.request', userId: 'p10' }, now)).toThrow('Too many');
  });

  it('deletes the current account and related local records', () => {
    const initial = state({ viewerId: 'b', sessions: [session({ participants: ['a', 'b'] })],
      connections: [{ id: 'ab', from: 'a', to: 'b', status: 'accepted' }] });
    const deleted = applyCommand(initial, { type: 'account.delete' }, now);
    expect(deleted.viewerId).toBeNull();
    expect(deleted.profiles.some(p => p.id === 'b')).toBe(false);
    expect(deleted.sessions[0].participants).toEqual(['a']);
    expect(deleted.connections).toEqual([]);
  });
});
