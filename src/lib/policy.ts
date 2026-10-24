import { commandSchema, profileSchema, sessionSchema, sportSchema, venueSchema } from './model';
import type { Command, CommunityState, MatchingWeights, Profile, Session } from './model';

const fail = (message: string): never => { throw new Error(message); };
const unique = (items: string[]) => [...new Set(items)];
const eligible = (profile: Profile | null | undefined): profile is Profile =>
  Boolean(profile?.adult && profile.onboarded && ['member', 'guest', 'admin'].includes(profile.role));
const admin = (profile: Profile | undefined) => eligible(profile) && profile.role === 'admin';
const byId = (state: CommunityState, id: string) => state.profiles.find(p => p.id === id);
const member = (state: CommunityState, id: string) => {
  const profile = byId(state, id);
  if (!eligible(profile)) fail('Membership required');
  return profile;
};
const activeSport = (state: CommunityState, id: string) => state.sports.find(s => s.id === id && s.active);
const replace = <T extends { id: string }>(items: T[], item: T): T[] =>
  items.map(value => value.id === item.id ? item : value);
const appendOrReplace = <T extends { id: string }>(items: T[], item: T): T[] =>
  items.some(value => value.id === item.id) ? replace(items, item) : [...items, item];
const iso = (date: Date) => date.toISOString();
const future = (value: string, now: Date) => Number.isFinite(Date.parse(value)) && Date.parse(value) > now.getTime();
const pair = (a: string, b: string) => [a, b].sort().join(':');
const connection = (state: CommunityState, a: string, b: string) =>
  state.connections.find(item => pair(item.from, item.to) === pair(a, b));

export function isBlocked(state: CommunityState, a: string, b: string): boolean {
  return state.blocks.some(block =>
    (block.from === a && block.to === b) || (block.from === b && block.to === a));
}

export function canMessage(state: CommunityState, from: string, to: string): boolean {
  return from !== to && eligible(byId(state, from)) && eligible(byId(state, to)) &&
    !isBlocked(state, from, to) && connection(state, from, to)?.status === 'accepted';
}

function sessionVisible(state: CommunityState, session: Session, viewer: Profile | null): boolean {
  if (!eligible(viewer) || session.status !== 'open') return false;
  if (session.visibility === 'members' && viewer.role === 'guest') return false;
  if (session.visibility === 'invitation' && session.organizerId !== viewer.id &&
      !session.invited.includes(viewer.id) && !session.participants.includes(viewer.id)) return false;
  return !isBlocked(state, session.organizerId, viewer.id);
}

export function visibleSessions(state: CommunityState, viewer: Profile | null): Session[] {
  return state.sessions.filter(session => sessionVisible(state, session, viewer));
}

function overlap(a: Profile, b: Profile): number {
  if (a.timezone !== b.timezone) return 0;
  const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
  const merged = (slots: Profile['availability'], day: number) => {
    const ranges = slots.filter(slot => slot.day === day)
      .map(slot => ({ start: minutes(slot.start), end: minutes(slot.end) }))
      .sort((left, right) => left.start - right.start);
    const result: typeof ranges = [];
    for (const range of ranges) {
      const last = result[result.length - 1];
      if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
      else result.push({ ...range });
    }
    return result;
  };
  let total = 0;
  for (let day = 0; day < 7; day++) {
    const left = merged(a.availability, day);
    const right = merged(b.availability, day);
    let i = 0, j = 0;
    while (i < left.length && j < right.length) {
      total += Math.max(0, Math.min(left[i].end, right[j].end) - Math.max(left[i].start, right[j].start));
      if (left[i].end < right[j].end) i++;
      else j++;
    }
  }
  return total;
}

function meetsSkill(profile: Profile, session: Session): boolean {
  if (session.skill === 'all') return true;
  const rank = { new: 0, beginner: 1, intermediate: 2, advanced: 3 };
  const actual = profile.sports[session.sportId];
  return actual !== undefined && rank[actual] >= rank[session.skill];
}

function weightedScore(parts: MatchingWeights, values: MatchingWeights): number {
  const keys: (keyof MatchingWeights)[] = ['sports', 'availability', 'skill', 'community', 'goals'];
  const total = keys.reduce((sum, key) => sum + parts[key], 0);
  if (total === 0) return 0;
  return Math.round(100 * keys.reduce((sum, key) => sum + parts[key] * values[key], 0) / total);
}

export function matchPeople(state: CommunityState, viewer: Profile): Array<{
  profile: Profile; score: number; sharedSports: string[]; overlap: number; reasons: string[]
}> {
  if (!eligible(viewer)) return [];
  const ranks = ['new', 'beginner', 'intermediate', 'advanced'];
  return state.profiles.filter(profile => profile.id !== viewer.id && profile.discoverable &&
    eligible(profile) && !isBlocked(state, viewer.id, profile.id)).map(profile => {
    const sharedSports = Object.keys(viewer.sports).filter(id => id in profile.sports && activeSport(state, id));
    const minutes = overlap(viewer, profile);
    const sharedGoals = viewer.goals.filter(goal => profile.goals.includes(goal));
    const skill = sharedSports.length ? sharedSports.reduce((sum, sport) =>
      sum + 1 - Math.abs(ranks.indexOf(viewer.sports[sport]) - ranks.indexOf(profile.sports[sport])) / 3, 0) / sharedSports.length : 0;
    const values: MatchingWeights = {
      sports: Math.min(1, sharedSports.length / 2),
      availability: Math.min(1, minutes / 120),
      skill,
      community: viewer.area && viewer.area === profile.area ? 1 : 0,
      goals: sharedGoals.length ? Math.min(1, sharedGoals.length / 2) : 0,
    };
    const reasons = (Object.keys(values) as (keyof MatchingWeights)[]).filter(key => values[key] > 0);
    return { profile, score: weightedScore(state.settings.weights, values), sharedSports, overlap: minutes, reasons };
  }).sort((a, b) => b.score - a.score || a.profile.id.localeCompare(b.profile.id));
}

function validSession(state: CommunityState, session: Session, now: Date): void {
  sessionSchema.parse(session);
  const sport = activeSport(state, session.sportId) ?? fail('Active sport required');
  if (!sport.formats.includes(session.format)) fail('Unsupported format');
  if (session.capacity < sport.minPlayers || session.capacity > Math.min(sport.maxPlayers, 100)) fail('Invalid capacity');
  if (session.venueId) {
    const venue = state.venues.find(item => item.id === session.venueId);
    if (!venue || !venue.sports.includes(session.sportId)) fail('Venue does not support sport');
  }
  if (!future(session.date, now)) fail('Session must be in the future');
  if (session.participants.length > session.capacity) fail('Session is over capacity');
  if (unique(session.participants).length !== session.participants.length) fail('Duplicate participant');
}

function sessionFor(state: CommunityState, id: string): Session {
  return state.sessions.find(session => session.id === id) ?? fail('Session not found');
}

function nextId(prefix: string, state: CommunityState, now: Date): string {
  const existing = new Set([
    ...state.connections.map(x => x.id), ...state.messages.map(x => x.id),
    ...state.comments.map(x => x.id), ...state.reports.map(x => x.id),
    ...state.announcements.map(x => x.id),
  ]);
  let n = 0;
  while (existing.has(`${prefix}-${now.getTime()}-${n}`)) n++;
  return `${prefix}-${now.getTime()}-${n}`;
}

export function applyCommand(state: CommunityState, command: Command, now = new Date()): CommunityState {
  commandSchema.parse(command);
  const actorId = state.viewerId ?? fail('Sign in required');
  const actor = byId(state, actorId) ?? fail('Profile not found');
  const timestamp = iso(now);
  const requireAdmin = () => { if (!admin(actor)) fail('Admin required'); };
  const requireMember = () => member(state, actorId);
  const updateSession = (session: Session) => ({ ...state, sessions: replace(state.sessions, session) });

  switch (command.type) {
    case 'profile.save': {
      profileSchema.parse(command.profile);
      if (command.profile.id !== actorId) fail('Cannot edit another profile');
      if (command.profile.role !== actor.role || command.profile.adult !== actor.adult) fail('Cannot change membership or adult status');
      return { ...state, profiles: replace(state.profiles, command.profile) };
    }
    case 'session.create': {
      requireMember();
      const session = command.session;
      if (state.sessions.some(item => item.id === session.id)) fail('Session ID exists');
      if (session.organizerId !== actorId || session.status !== 'open' ||
          session.participants.length !== 1 || session.participants[0] !== actorId ||
          session.pending.length || session.waitlist.length) fail('Invalid new session');
      validSession(state, session, now);
      return { ...state, sessions: [...state.sessions, session] };
    }
    case 'session.join': {
      requireMember();
      const session = sessionFor(state, command.id);
      if (!sessionVisible(state, session, actor) || !future(session.date, now) ||
          !activeSport(state, session.sportId) || !meetsSkill(actor, session)) fail('Session unavailable');
      if (session.participants.includes(actorId) || session.pending.includes(actorId) || session.waitlist.includes(actorId)) return state;
      if (session.approval) return updateSession({ ...session, pending: [...session.pending, actorId] });
      if (session.participants.length >= session.capacity) return updateSession({ ...session, waitlist: [...session.waitlist, actorId] });
      return updateSession({ ...session, participants: [...session.participants, actorId] });
    }
    case 'session.leave': {
      const session = sessionFor(state, command.id);
      if (session.organizerId === actorId) fail('Organizer must cancel');
      if (!session.participants.includes(actorId) && !session.pending.includes(actorId) && !session.waitlist.includes(actorId)) return state;
      const participants = session.participants.filter(id => id !== actorId);
      const waitlist = session.waitlist.filter(id => id !== actorId);
      if (!session.approval && participants.length < session.capacity && waitlist.length) {
        while (waitlist.length && participants.length < session.capacity) {
          const next = waitlist.shift();
          const candidate = next && byId(state, next);
          if (candidate && eligible(candidate) && !isBlocked(state, candidate.id, session.organizerId) &&
              activeSport(state, session.sportId) && meetsSkill(candidate, session)) participants.push(candidate.id);
        }
      }
      return updateSession({ ...session, participants, waitlist, pending: session.pending.filter(id => id !== actorId) });
    }
    case 'session.cancel': {
      const session = sessionFor(state, command.id);
      if (session.organizerId !== actorId && !admin(actor)) fail('Organizer or admin required');
      return session.status === 'cancelled' ? state : updateSession({ ...session, status: 'cancelled' });
    }
    case 'session.approve': {
      const session = sessionFor(state, command.id);
      if (session.organizerId !== actorId && !admin(actor)) fail('Organizer or admin required');
      const applicant = byId(state, command.userId);
      if (!session.pending.includes(command.userId) || !eligible(applicant) ||
          !sessionVisible(state, session, applicant ?? null) || !future(session.date, now) ||
          !activeSport(state, session.sportId) || !meetsSkill(applicant, session)) fail('Applicant unavailable');
      if (session.participants.length >= session.capacity) fail('Session full');
      return updateSession({ ...session, pending: session.pending.filter(id => id !== command.userId), participants: [...session.participants, command.userId] });
    }
    case 'connection.request': {
      requireMember();
      if (command.userId === actorId || !eligible(byId(state, command.userId)) ||
          !byId(state, command.userId)?.discoverable || isBlocked(state, actorId, command.userId)) fail('Person unavailable');
      const prior = connection(state, actorId, command.userId);
      if (prior?.status === 'pending' || prior?.status === 'accepted') return state;
      if (state.connections.filter(item => item.from === actorId && item.status === 'pending').length >= 10) fail('Too many pending requests');
      const item = { id: nextId('connection', state, now), from: actorId, to: command.userId, status: 'pending' as const };
      return { ...state, connections: [...state.connections.filter(value => pair(value.from, value.to) !== pair(actorId, command.userId)), item] };
    }
    case 'connection.respond': {
      requireMember();
      const item = state.connections.find(value => value.id === command.id) ?? fail('Connection not found');
      if (item.to !== actorId || item.status !== 'pending' || isBlocked(state, item.from, item.to)) fail('Cannot respond');
      return { ...state, connections: replace(state.connections, { ...item, status: command.accept ? 'accepted' : 'rejected' }) };
    }
    case 'connection.remove': {
      const item = state.connections.find(value => value.id === command.id) ?? fail('Connection not found');
      if (item.from !== actorId && item.to !== actorId) fail('Cannot remove connection');
      return { ...state, connections: state.connections.filter(value => value.id !== item.id) };
    }
    case 'message.send': {
      if (!canMessage(state, actorId, command.userId)) fail('Accepted connection required');
      return { ...state, messages: [...state.messages, { id: nextId('message', state, now), from: actorId, to: command.userId, body: command.body, createdAt: timestamp }] };
    }
    case 'comment.send': {
      requireMember();
      const session = sessionFor(state, command.sessionId);
      if (!sessionVisible(state, session, actor) || !future(session.date, now)) fail('Session unavailable');
      return { ...state, comments: [...state.comments, { id: nextId('comment', state, now), sessionId: session.id, authorId: actorId, body: command.body, createdAt: timestamp }] };
    }
    case 'user.block': {
      requireMember();
      if (actorId === command.userId || !byId(state, command.userId)) fail('Person unavailable');
      if (isBlocked(state, actorId, command.userId)) return state;
      return { ...state, blocks: [...state.blocks, { from: actorId, to: command.userId }],
        connections: state.connections.filter(item => pair(item.from, item.to) !== pair(actorId, command.userId)) };
    }
    case 'user.report': {
      requireMember();
      if (actorId === command.targetId || !byId(state, command.targetId)) fail('Person unavailable');
      return { ...state, reports: [...state.reports, { id: nextId('report', state, now), reporterId: actorId, targetId: command.targetId, reason: command.reason, status: 'open' }] };
    }
    case 'saved.toggle':
    case 'like.toggle': {
      requireMember();
      if (!state.sessions.some(item => item.id === command.id && sessionVisible(state, item, actor))) fail('Session unavailable');
      const key = command.type === 'saved.toggle' ? 'saved' : 'likes';
      return { ...state, [key]: state[key].includes(command.id) ? state[key].filter(id => id !== command.id) : [...state[key], command.id] };
    }
    case 'notifications.read': {
      requireMember();
      return { ...state, notifications: state.notifications.map(item => ({ ...item, read: true })) };
    }
    case 'admin.sport': {
      requireAdmin();
      sportSchema.parse(command.sport);
      if (command.sport.minPlayers > command.sport.maxPlayers) fail('Invalid player range');
      return { ...state, sports: appendOrReplace(state.sports, command.sport) };
    }
    case 'admin.venue': {
      requireAdmin();
      venueSchema.parse(command.venue);
      if (command.venue.sports.some(id => !activeSport(state, id))) fail('Venue sport unavailable');
      return { ...state, venues: appendOrReplace(state.venues, command.venue) };
    }
    case 'admin.member': {
      requireAdmin();
      const profile = byId(state, command.userId) ?? fail('Person unavailable');
      if (!profile.adult || !profile.onboarded) fail('Adult onboarding required');
      if (profile.role === 'admin') fail('Cannot change admin role');
      return { ...state, profiles: replace(state.profiles, { ...profile, role: command.role }) };
    }
    case 'admin.announcement': {
      requireAdmin();
      return { ...state, announcements: [...state.announcements, { id: nextId('announcement', state, now), title: command.title, body: command.body, createdAt: timestamp }] };
    }
    case 'admin.settings': {
      requireAdmin();
      const weights = command.settings.weights;
      if (Object.values(weights).some(value => !Number.isFinite(value) || value < 0)) fail('Invalid weights');
      return { ...state, settings: command.settings };
    }
    case 'admin.report': {
      requireAdmin();
      if (!state.reports.some(item => item.id === command.id)) fail('Report not found');
      return { ...state, reports: state.reports.map(item => item.id === command.id ? { ...item, status: 'resolved' } : item) };
    }
    case 'account.delete': {
      return { ...state, viewerId: null, profiles: state.profiles.filter(item => item.id !== actorId),
        sessions: state.sessions.filter(item => item.organizerId !== actorId).map(item => ({ ...item,
          participants: item.participants.filter(id => id !== actorId), pending: item.pending.filter(id => id !== actorId),
          waitlist: item.waitlist.filter(id => id !== actorId), invited: item.invited.filter(id => id !== actorId) })),
        connections: state.connections.filter(item => item.from !== actorId && item.to !== actorId),
        messages: state.messages.filter(item => item.from !== actorId && item.to !== actorId),
        comments: state.comments.filter(item => item.authorId !== actorId),
        reports: state.reports.filter(item => item.reporterId !== actorId && item.targetId !== actorId),
        blocks: state.blocks.filter(item => item.from !== actorId && item.to !== actorId), saved: [], likes: [], notifications: [] };
    }
    default: {
      const exhaustive: never = command;
      return exhaustive;
    }
  }
}
