import { stateSchema, type CommunityState, type Profile } from '../../src/lib/model';
import { canMessage, isBlocked, visibleSessions } from '../../src/lib/policy';
import type { Preferences } from './store';

const approved = (person: Profile | undefined): person is Profile => Boolean(person?.adult && person.onboarded && person.role !== 'pending');

/** This is the only path from full stored state to a response. */
export function projectState(base: CommunityState, userId: string | null, preferences: Preferences): CommunityState {
  const self = userId ? base.profiles.find(person => person.id === userId) : undefined;
  const social = approved(self);
  const publicState: CommunityState = {
    ...base, viewerId: userId && self ? userId : null,
    sports: base.sports.filter(sport => sport.active || self?.role === 'admin'),
    profiles: [], sessions: [], connections: [], messages: [], comments: [], notifications: [],
    reports: [], blocks: [], saved: [], likes: [],
  };
  if (!userId || !self) return stateSchema.parse(publicState);
  const connections = social ? base.connections.filter(edge =>
    (edge.from === userId || edge.to === userId) && !isBlocked(base, edge.from, edge.to)) : [];
  const relatedIds = new Set(connections.filter(edge => edge.status === 'accepted')
    .map(edge => edge.from === userId ? edge.to : edge.from));
  const profiles = base.profiles.filter(person => person.id === userId || (self.role === 'admin' && person.adult) || (social && approved(person) &&
    !isBlocked(base, userId, person.id) && (person.discoverable || relatedIds.has(person.id))));
  const sessions = social ? visibleSessions(base, self).map(session => {
    const canManage = session.organizerId === userId || self.role === 'admin';
    return {...session, pending: session.pending.filter(id => canManage || id === userId), waitlist: session.waitlist.filter(id => canManage || id === userId), invited: session.invited.filter(id => canManage || id === userId)};
  }) : [];
  const sessionIds = new Set(sessions.map(session => session.id));
  const messages = social ? base.messages.filter(message =>
    (message.from === userId || message.to === userId) && canMessage(base, message.from, message.to)) : [];
  return stateSchema.parse({
    ...publicState, profiles, sessions, connections, messages,
    comments: social ? base.comments.filter(comment => sessionIds.has(comment.sessionId) && !isBlocked(base, userId, comment.authorId)) : [],
    notifications: social ? preferences.notifications : [],
    reports: social ? base.reports.filter(report => self.role === 'admin' || report.reporterId === userId) : [],
    blocks: social ? base.blocks.filter(block => block.from === userId) : [],
    saved: social ? preferences.saved.filter(id => sessionIds.has(id)) : [],
    likes: social ? preferences.likes.filter(id => sessionIds.has(id)) : [],
  });
}
