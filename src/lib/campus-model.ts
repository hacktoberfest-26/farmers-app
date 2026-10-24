import { z } from 'zod';

export const interests = [
  { id: 'technology', en: 'Technology & AI', it: 'Tecnologia e AI', icon: '✳', accessory: 'antenna' },
  { id: 'business', en: 'Startups & business', it: 'Startup e impresa', icon: '↗', accessory: 'satchel' },
  { id: 'design', en: 'Design & creativity', it: 'Design e creatività', icon: '✿', accessory: 'pencil' },
  { id: 'sustainability', en: 'Sustainability', it: 'Sostenibilità', icon: '⌁', accessory: 'leaf' },
  { id: 'arts', en: 'Arts & culture', it: 'Arte e cultura', icon: '◈', accessory: 'beret' },
  { id: 'sport', en: 'Sport & movement', it: 'Sport e movimento', icon: '◉', accessory: 'racket' },
  { id: 'music', en: 'Music & sound', it: 'Musica e suono', icon: '♫', accessory: 'headphones' },
  { id: 'community', en: 'Campus & community', it: 'Campus e comunità', icon: '☷', accessory: 'book' },
] as const;
export const interestId = z.enum(['technology','business','design','sustainability','arts','sport','music','community']);
export const goalId = z.enum(['cofounder','join-project','sport','lunch','events']);
export const skillId = z.enum(['engineering','design','business','marketing','research','operations']);
export const sportId = z.enum(['tennis','padel','gym','basketball','volleyball','bmx','soccer','skateboarding','climbing']);
export const daySchema = z.number().int().min(0).max(6);
export const slotSchema = z.enum(['morning','afternoon','evening']);
export const colours = ['#6d8566','#b88767','#7a80a6','#b8a04d','#658c96','#ad7390'] as const;
export const avatarSchema = z.object({ colour: z.enum(colours), interests: z.array(interestId).max(6) });
export type InterestAvatar = z.infer<typeof avatarSchema>;
export const campusSportSchema = z.object({ sport: sportId, level: z.enum(['beginner','intermediate','advanced']), days: z.array(daySchema).min(1).max(7), slots: z.array(slotSchema).min(1).max(3) });
export const campusProfileSchema = z.object({
  name: z.string().trim().min(2).max(60), course: z.string().trim().max(100), year: z.string().max(20),
  interests: z.array(interestId).min(3).max(6).refine(values=>new Set(values).size===values.length),
  skills: z.array(skillId).max(6), lookingFor: z.array(goalId).min(1).max(5),
  sports: z.array(campusSportSchema).max(9), privateIdea: z.string().max(2000),
  colour: z.enum(colours), consent: z.object({ matching: z.boolean(), hostedAi: z.boolean(), events: z.boolean(), resources: z.boolean() }),
});
export type CampusProfileInput = z.infer<typeof campusProfileSchema>;
export const campusMemberSchema = z.object({
  id: z.string(), email: z.email(), role: z.enum(['student','startup','staff','admin']),
  verification: z.enum(['email','operator','unverified','demo']), complete: z.boolean(), revision: z.number().int(),
  profile: campusProfileSchema,
});
export type CampusMember = z.infer<typeof campusMemberSchema>;
export const reasonCode = z.enum(['shared_interests','complementary_skills','shared_goal','same_sport','shared_availability']);
export const judgementSchema = z.object({ score: z.number().int().min(0).max(100), reasonCodes: z.array(reasonCode).min(1).max(3) });
export type MatchJudgement = z.infer<typeof judgementSchema>;
export const matchType = z.enum(['cofounder','sport','lunch']);
export type MatchType = z.infer<typeof matchType>;
export const feedbackInputSchema = z.object({ rating:z.number().int().min(1).max(5), outcome:z.enum(['met','planned','did-not-meet']), comment:z.string().trim().max(1000).default('') });
export const matchFeedbackSchema = feedbackInputSchema.extend({ createdAt:z.iso.datetime(), updatedAt:z.iso.datetime() });
export type FeedbackInput = z.infer<typeof feedbackInputSchema>;
export type MatchFeedback = z.infer<typeof matchFeedbackSchema>;
export const campusMemberEligible = (member: CampusMember) => member.complete && member.verification !== 'unverified' && member.profile.consent.matching && member.profile.consent.hostedAi;
const cardFields = { id: z.string(), matchType, avatar: avatarSchema, reasons: z.array(reasonCode).max(3), expiresAt: z.string() };
export const matchViewSchema = z.discriminatedUnion('kind',[
  z.object({ ...cardFields, kind: z.literal('anonymous'), myAnswer: z.enum(['pending','yes']) }),
  z.object({ ...cardFields, kind: z.literal('revealed'), feedback:matchFeedbackSchema.nullable().optional(), person: z.object({ name: z.string(), course: z.string(), year: z.string(), email: z.email() }) }),
]);
export type MatchView = z.infer<typeof matchViewSchema>;
export const campusEventSchema = z.object({ id:z.string(), title:z.string().min(2).max(160), date:z.iso.datetime(), place:z.string().max(160), topics:z.array(interestId).min(1).max(6), source:z.enum(['manual','poster','demo']) });
export type CampusEvent = z.infer<typeof campusEventSchema>;
export const staffAlertSchema = z.object({ id:z.string(), title:z.string(), body:z.string(), status:z.enum(['open','resolved']) });
export const agentStatusSchema = z.object({ configured:z.boolean(), model:z.string(), status:z.enum(['ready','running','not-configured','error']), lastRun:z.string().nullable() });
export const campusHomeSchema = z.object({
  me:campusMemberSchema.nullable(), suggestions:z.array(matchViewSchema), events:z.array(campusEventSchema), alerts:z.array(staffAlertSchema),
  agent:agentStatusSchema, auth:z.object({emailEnabled:z.boolean(),domains:z.array(z.string()),sharedDemo:z.boolean().optional()}), demo:z.boolean(),
});
export type CampusHome = z.infer<typeof campusHomeSchema>;
export const engineReportSchema = z.object({ scanned:z.number(),scored:z.number(),published:z.number(),status:z.enum(['completed','started','busy','unavailable']) });
export type EngineReport = z.infer<typeof engineReportSchema>;
export const campusSessionSchema = z.object({token:z.string().min(20),userId:z.string()});
export function initialCampusProfile(name='Campus member'):CampusProfileInput {
  return {name,course:'',year:'',interests:['technology','design','community'],skills:[],lookingFor:['events'],sports:[],privateIdea:'',colour:colours[0],consent:{matching:false,hostedAi:false,events:false,resources:false}};
}

export const locationFixSchema = z.object({ latitude:z.number().min(-90).max(90), longitude:z.number().min(-180).max(180), accuracy:z.number().min(0).max(100000), simulated:z.boolean() });
export const sharedLocationSchema = locationFixSchema.extend({ updatedAt:z.number() });
export const campusMapSchema = z.object({ own:sharedLocationSchema.nullable(), people:z.array(z.object({ matchId:z.string(),name:z.string(),avatar:avatarSchema,location:sharedLocationSchema })) });
export type LocationFix = z.infer<typeof locationFixSchema>;
export type CampusMapState = z.infer<typeof campusMapSchema>;
