import { z } from 'zod';

const safeHttpsURL = z.string().refine(value => {if (!value) return true; try {return new URL(value).protocol === 'https:';} catch {return false;}}, 'Use an HTTPS URL');
const timezoneSchema = z.string().refine(value => {try {new Intl.DateTimeFormat('en',{timeZone:value});return true;}catch{return false;}}, 'Use a valid IANA time zone');
export const localeSchema = z.enum(['en', 'it']);
export type Locale = z.infer<typeof localeSchema>;
export const localizedSchema = z.object({ en: z.string(), it: z.string() });
export const availabilitySchema = z.object({ day: z.number().int().min(0).max(6), start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/) }).refine(s => s.start < s.end, 'End must be after start');
export const skillSchema = z.enum(['new', 'beginner', 'intermediate', 'advanced']);
export type Skill = z.infer<typeof skillSchema>;
export const sportSchema = z.object({ id: z.string(), name: localizedSchema, emoji: z.string(), color: z.string(), active: z.boolean(), formats: z.array(z.string()).min(1), minPlayers: z.number().int().positive(), maxPlayers: z.number().int().positive(), overview: localizedSchema, rules: localizedSchema, equipment: localizedSchema, safety: localizedSchema });
export type Sport = z.infer<typeof sportSchema>;
export const profileSchema = z.object({ id: z.string(), name: z.string().min(2).max(60), bio: z.string().max(300), area: z.string().max(100), avatar: safeHttpsURL, color: z.string(), sports: z.record(z.string(), skillSchema), favorites: z.array(z.string()), availability: z.array(availabilitySchema), exceptions: z.array(z.object({ date: z.string(), unavailable: z.boolean() })).default([]), goals: z.array(z.string()), discoverable: z.boolean(), role: z.enum(['member', 'guest', 'pending', 'admin']), adult: z.boolean(), onboarded: z.boolean(), locale: localeSchema, timezone: timezoneSchema });
export type Profile = z.infer<typeof profileSchema>;
export const venueSchema = z.object({ id: z.string(), name: z.string(), area: localizedSchema, address: z.string(), campus: z.boolean(), sports: z.array(z.string()), price: localizedSchema, access: localizedSchema, hours: localizedSchema, accessibility: localizedSchema, bookingUrl: safeHttpsURL, verifiedAt: z.string().nullable(), lat: z.number(), lng: z.number() });
export type Venue = z.infer<typeof venueSchema>;
export const sessionSchema = z.object({ id: z.string(), sportId: z.string(), organizerId: z.string(), title: z.string().min(3).max(100), description: z.string().max(1000), date: z.string(), duration: z.number().int().min(15).max(480), venueId: z.string(), format: z.string(), capacity: z.number().int().min(2).max(100), skill: z.enum(['all', 'new', 'beginner', 'intermediate', 'advanced']), visibility: z.enum(['community', 'members', 'invitation']), approval: z.boolean(), participants: z.array(z.string()), pending: z.array(z.string()), waitlist: z.array(z.string()), invited: z.array(z.string()), status: z.enum(['open', 'cancelled', 'completed']), booking: z.enum(['not-booked', 'confirmed']), createdAt: z.string() });
export type Session = z.infer<typeof sessionSchema>;
export const connectionSchema = z.object({ id: z.string(), from: z.string(), to: z.string(), status: z.enum(['pending', 'accepted', 'rejected']) });
export const messageSchema = z.object({ id: z.string(), from: z.string(), to: z.string(), body: z.string().min(1).max(2000), createdAt: z.string() });
export const commentSchema = z.object({ id: z.string(), sessionId: z.string(), authorId: z.string(), body: z.string().min(1).max(1000), createdAt: z.string() });
export const notificationSchema = z.object({ id: z.string(), body: z.string(), read: z.boolean(), createdAt: z.string() });
export const announcementSchema = z.object({ id: z.string(), title: z.string(), body: z.string(), createdAt: z.string() });
export const reportSchema = z.object({ id: z.string(), reporterId: z.string(), targetId: z.string(), reason: z.string(), status: z.enum(['open', 'resolved']) });
export const settingsSchema = z.object({ name: z.string(), description: z.string(), weights: z.object({ sports: z.number().nonnegative(), availability: z.number().nonnegative(), skill: z.number().nonnegative(), community: z.number().nonnegative(), goals: z.number().nonnegative() }) });
export const stateSchema = z.object({ version: z.literal(1), viewerId: z.string().nullable(), profiles: z.array(profileSchema), sports: z.array(sportSchema), venues: z.array(venueSchema), sessions: z.array(sessionSchema), connections: z.array(connectionSchema), messages: z.array(messageSchema), comments: z.array(commentSchema), notifications: z.array(notificationSchema), announcements: z.array(announcementSchema), reports: z.array(reportSchema), blocks: z.array(z.object({ from: z.string(), to: z.string() })), saved: z.array(z.string()), likes: z.array(z.string()), settings: settingsSchema });
export type CommunityState = z.infer<typeof stateSchema>;
export type MatchingWeights = z.infer<typeof settingsSchema>['weights'];
export const commandSchema = z.discriminatedUnion('type', [
 z.object({ type: z.literal('profile.save'), profile: profileSchema }),
 z.object({ type: z.literal('session.create'), session: sessionSchema }),
 z.object({ type: z.literal('session.join'), id: z.string() }),
 z.object({ type: z.literal('session.leave'), id: z.string() }),
 z.object({ type: z.literal('session.cancel'), id: z.string() }),
 z.object({ type: z.literal('session.approve'), id: z.string(), userId: z.string() }),
 z.object({ type: z.literal('connection.request'), userId: z.string() }),
 z.object({ type: z.literal('connection.respond'), id: z.string(), accept: z.boolean() }),
 z.object({ type: z.literal('connection.remove'), id: z.string() }),
 z.object({ type: z.literal('message.send'), userId: z.string(), body: z.string().trim().min(1).max(2000) }),
 z.object({ type: z.literal('comment.send'), sessionId: z.string(), body: z.string().trim().min(1).max(1000) }),
 z.object({ type: z.literal('user.block'), userId: z.string() }),
 z.object({ type: z.literal('user.report'), targetId: z.string(), reason: z.string().trim().min(3).max(1000) }),
 z.object({ type: z.literal('saved.toggle'), id: z.string() }),
 z.object({ type: z.literal('like.toggle'), id: z.string() }),
 z.object({ type: z.literal('notifications.read') }),
 z.object({ type: z.literal('admin.sport'), sport: sportSchema }),
 z.object({ type: z.literal('admin.venue'), venue: venueSchema }),
 z.object({ type: z.literal('admin.member'), userId: z.string(), role: z.enum(['member', 'guest', 'pending']) }),
 z.object({ type: z.literal('admin.announcement'), title: z.string().min(3).max(100), body: z.string().min(3).max(1000) }),
 z.object({ type: z.literal('admin.settings'), settings: settingsSchema }),
 z.object({ type: z.literal('admin.report'), id: z.string() }),
 z.object({ type: z.literal('account.delete') })
]);
export type Command = z.infer<typeof commandSchema>;
export const communityConfig = {
 id: process.env.NEXT_PUBLIC_COMMUNITY_ID || '11111111-1111-4111-8111-111111111111',
 name: process.env.NEXT_PUBLIC_COMMUNITY_NAME || 'H-FARM',
 location: process.env.NEXT_PUBLIC_COMMUNITY_LOCATION || 'Roncade, Treviso',
 timezone: process.env.NEXT_PUBLIC_COMMUNITY_TIMEZONE || 'Europe/Rome',
 basePath: process.env.NEXT_PUBLIC_BASE_PATH || '',
};
