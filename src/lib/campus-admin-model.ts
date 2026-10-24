import { z } from 'zod';
import { campusMemberSchema, campusProfileSchema, campusEventSchema, sharedLocationSchema, matchFeedbackSchema, matchType, reasonCode, agentStatusSchema } from './campus-model';
export const adminScopeSchema=z.enum(['all','demo','live']);
export type AdminScope=z.infer<typeof adminScopeSchema>;
export const adminQuerySchema=z.object({scope:adminScopeSchema.default('all'),page:z.coerce.number().int().min(0).max(100000).default(0),limit:z.coerce.number().int().min(1).max(100).default(20),q:z.string().trim().max(100).default(''),status:z.enum(['all','pending','mutual','declined','expired','revoked']).default('all')});
export type AdminQuery=z.infer<typeof adminQuerySchema>;
export const adminMemberSchema=campusMemberSchema.extend({profile:campusProfileSchema.omit({privateIdea:true})});
const personSchema=z.object({id:z.string(),name:z.string(),email:z.string(),demo:z.boolean()});
export const adminUserSchema=z.object({id:z.string(),email:z.string(),createdAt:z.number(),member:adminMemberSchema.nullable(),activeSessions:z.number(),pushDevices:z.number()});
export const adminMatchSchema=z.object({id:z.string(),a:personSchema,b:personSchema,matchType,reasons:z.array(reasonCode),status:z.enum(['pending','mutual','declined','expired','revoked']),expiresAt:z.number(),revokedAt:z.number().nullable(),answerA:z.enum(['pending','yes','no']),answerB:z.enum(['pending','yes','no']),feedbackA:matchFeedbackSchema.nullable(),feedbackB:matchFeedbackSchema.nullable()});
export const adminLocationSchema=z.object({person:personSchema,location:sharedLocationSchema,expiresAt:z.number()});
export const adminFeedbackSchema=z.object({matchId:z.string(),author:personSchema,partner:personSchema,matchType,feedback:matchFeedbackSchema});
const pageFields={total:z.number(),page:z.number(),limit:z.number(),generatedAt:z.number()};
export const adminListSchema=z.discriminatedUnion('section',[
 z.object({...pageFields,section:z.literal('users'),rows:z.array(adminUserSchema)}),
 z.object({...pageFields,section:z.literal('matches'),rows:z.array(adminMatchSchema)}),
 z.object({...pageFields,section:z.literal('locations'),rows:z.array(adminLocationSchema)}),
 z.object({...pageFields,section:z.literal('events'),rows:z.array(campusEventSchema)}),
 z.object({...pageFields,section:z.literal('feedback'),rows:z.array(adminFeedbackSchema)}),
]);
export type AdminList=z.infer<typeof adminListSchema>;
export const adminSectionSchema=z.enum(['users','matches','locations','events','feedback']);
export type AdminSection=z.infer<typeof adminSectionSchema>;
export const adminOverviewSchema=z.object({generatedAt:z.number(),scope:adminScopeSchema,
 accounts:z.number(),members:z.number(),complete:z.number(),eligible:z.number(),activeLocations:z.number(),events:z.number(),
 roles:z.array(z.object({label:z.string(),count:z.number()})),interests:z.array(z.object({label:z.string(),count:z.number()})),
 matches:z.object({pending:z.number(),mutual:z.number(),declined:z.number(),expired:z.number(),revoked:z.number()}),
 feedback:z.object({responses:z.number(),ratedMatches:z.number(),eligibleParticipants:z.number(),averageRating:z.number().nullable(),ratings:z.array(z.object({rating:z.number(),count:z.number()})),outcomes:z.array(z.object({label:z.string(),count:z.number()}))}),
 ai:z.object({agent:agentStatusSchema,day:z.string(),liveAttempts:z.number(),demoAttempts:z.number(),liveBudget:z.literal(30),demoBudget:z.literal(100),interestTasks:z.number(),posterTasks:z.number(),jobs:z.array(z.object({label:z.string(),count:z.number()}))}),
 push:z.object({configured:z.boolean(),devices:z.number(),pending:z.number(),retrying:z.number(),exhausted:z.number()})
});
export type AdminOverview=z.infer<typeof adminOverviewSchema>;
