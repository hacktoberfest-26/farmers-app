import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { campusMemberSchema,campusMemberEligible,campusEventSchema,sharedLocationSchema,matchFeedbackSchema,type CampusMember } from '../../src/lib/campus-model';
import { adminOverviewSchema,adminListSchema,adminUserSchema,adminMatchSchema,adminLocationSchema,adminFeedbackSchema,type AdminScope,type AdminQuery,type AdminSection } from '../../src/lib/campus-admin-model';
import { CampusError,type CampusService } from './campus-service';

const documentRow=z.object({document:z.string()});
const proposalRow=z.object({id:z.string(),a:z.string(),b:z.string(),kind:z.enum(['cofounder','sport','lunch']),reasons:z.string(),expires:z.number(),revoked:z.number().nullable()});
const answerRow=z.object({proposal_id:z.string(),user_id:z.string(),answer:z.enum(['yes','no'])});
const feedbackRow=matchFeedbackSchema.extend({proposal_id:z.string(),user_id:z.string()});
const countRows=z.array(z.object({user_id:z.string(),total:z.number()}));
const scoped=(demo:boolean,scope:AdminScope)=>scope==='all'||demo===(scope==='demo');
const person=(m:CampusMember)=>({id:m.id,name:m.profile.name,email:m.email,demo:m.verification==='demo'});
const histogram=(values:string[])=>[...new Set(values)].map(label=>({label,count:values.filter(v=>v===label).length})).sort((a,b)=>b.count-a.count);

/** Operator reporting over a synchronous SQLite snapshot. Only explicit safe projections leave this module. */
export class CampusAdmin {
 constructor(private readonly db:DatabaseSync,private readonly campus:CampusService,private readonly settings:{pushConfigured:boolean;sharedDemo:boolean},private readonly now=Date.now){}
 private requireOperator(id:string){const m=this.campus.member(id);if(m?.role!=='admin'||m.verification!=='operator')throw new CampusError(403,'Deployment operator access required');}
 private snapshot(scope:AdminScope){
  const now=this.now();
  const members=this.db.prepare('SELECT document FROM campus_members').all().map(row=>campusMemberSchema.parse(JSON.parse(documentRow.parse(row).document)));
  const byId=new Map(members.map(m=>[m.id,m]));
  const selected=members.filter(m=>scoped(m.verification==='demo',scope));
  const answers=new Map(this.db.prepare('SELECT proposal_id,user_id,answer FROM campus_answers').all().map(raw=>{const r=answerRow.parse(raw);return [`${r.proposal_id}:${r.user_id}`,r.answer];}));
  const feedback=this.db.prepare('SELECT proposal_id,user_id,rating,outcome,comment,created_at AS createdAt,updated_at AS updatedAt FROM campus_match_feedback ORDER BY updated_at DESC').all().map(row=>feedbackRow.parse(row));
  const feedbackById=new Map(feedback.map(f=>[`${f.proposal_id}:${f.user_id}`,matchFeedbackSchema.parse(f)]));
  const matches=this.db.prepare('SELECT id,a,b,kind,reasons,expires,revoked FROM campus_proposals ORDER BY expires DESC,id').all().flatMap(raw=>{
   const p=proposalRow.parse(raw),a=byId.get(p.a),b=byId.get(p.b);if(!a||!b||!scoped(a.verification==='demo',scope)||!scoped(b.verification==='demo',scope))return [];
   const answerA=answers.get(`${p.id}:${a.id}`)??'pending',answerB=answers.get(`${p.id}:${b.id}`)??'pending';
   const status=p.revoked!==null?'revoked':answerA==='no'||answerB==='no'?'declined':answerA==='yes'&&answerB==='yes'?'mutual':p.expires<=now?'expired':'pending';
   return [adminMatchSchema.parse({id:p.id,a:person(a),b:person(b),matchType:p.kind,reasons:JSON.parse(p.reasons),status,expiresAt:p.expires,revokedAt:p.revoked,answerA,answerB,feedbackA:feedbackById.get(`${p.id}:${a.id}`)??null,feedbackB:feedbackById.get(`${p.id}:${b.id}`)??null})];
  });
  const locations=this.db.prepare('SELECT user_id,document FROM campus_locations WHERE updated>? ORDER BY updated DESC,user_id').all(now-120000).flatMap(raw=>{
   const r=z.object({user_id:z.string(),document:z.string()}).parse(raw),m=byId.get(r.user_id);
   if(!m||!scoped(m.verification==='demo',scope)||!campusMemberEligible(m)||(m.verification==='demo'&&!this.settings.sharedDemo))return [];
   const location=sharedLocationSchema.parse(JSON.parse(r.document));return [adminLocationSchema.parse({person:person(m),location,expiresAt:location.updatedAt+120000})];
  });
  const events=this.db.prepare('SELECT document FROM campus_events').all().map(raw=>campusEventSchema.parse(JSON.parse(documentRow.parse(raw).document))).filter(e=>scoped(e.source==='demo',scope)).sort((a,b)=>b.date.localeCompare(a.date)||a.id.localeCompare(b.id));
  const sessions=new Map(countRows.parse(this.db.prepare('SELECT user_id,COUNT(*) AS total FROM auth_sessions WHERE expires_at>? GROUP BY user_id').all(now)).map(r=>[r.user_id,r.total]));
  const devices=new Map(countRows.parse(this.db.prepare('SELECT s.user_id,COUNT(*) AS total FROM campus_push_subscriptions s JOIN auth_sessions a ON a.token_hash=s.session_hash WHERE a.expires_at>? GROUP BY s.user_id').all(now)).map(r=>[r.user_id,r.total]));
  const users=this.db.prepare('SELECT id,email,created_at FROM auth_users ORDER BY created_at DESC,id').all().flatMap(raw=>{
   const u=z.object({id:z.string(),email:z.string(),created_at:z.number()}).parse(raw),m=byId.get(u.id)??null;
   if(!scoped(m?.verification==='demo',scope))return [];
   // Parsing the narrower schema strips privateIdea before any admin response is built.
   return [adminUserSchema.parse({id:u.id,email:u.email,createdAt:u.created_at,member:m,activeSessions:sessions.get(u.id)??0,pushDevices:devices.get(u.id)??0})];
  });
  const matchById=new Map(matches.map(m=>[m.id,m]));
  const responses=feedback.flatMap(f=>{const m=matchById.get(f.proposal_id);if(!m)return [];return [adminFeedbackSchema.parse({matchId:m.id,author:f.user_id===m.a.id?m.a:m.b,partner:f.user_id===m.a.id?m.b:m.a,matchType:m.matchType,feedback:matchFeedbackSchema.parse(f)})];});
  return {now,selected,users,matches,locations,events,responses};
 }
 list(actorId:string,section:AdminSection,query:AdminQuery){
  this.requireOperator(actorId);const data=this.snapshot(query.scope);const q=query.q.toLocaleLowerCase();
  const contains=(value:string)=>value.toLocaleLowerCase().includes(q);
  const rows=section==='users'?data.users.filter(u=>contains(`${u.email} ${u.member?.profile.name??''} ${u.member?.profile.course??''}`))
   :section==='matches'?data.matches.filter(m=>(query.status==='all'||m.status===query.status)&&contains(`${m.a.name} ${m.b.name} ${m.a.email} ${m.b.email}`))
   :section==='locations'?data.locations.filter(l=>contains(`${l.person.name} ${l.person.email}`))
   :section==='events'?data.events.filter(e=>contains(`${e.title} ${e.place}`))
   :data.responses.filter(f=>contains(`${f.author.name} ${f.partner.name} ${f.feedback.comment}`));
  return adminListSchema.parse({section,total:rows.length,page:query.page,limit:query.limit,generatedAt:data.now,rows:rows.slice(query.page*query.limit,(query.page+1)*query.limit)});
 }
 overview(actorId:string,scope:AdminScope){
  this.requireOperator(actorId);const data=this.snapshot(scope),day=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(data.now));
  const ids=new Set(data.selected.map(m=>m.id));
  const inference=(key:string)=>{const row=this.db.prepare('SELECT total FROM campus_inference_days WHERE campus_day=?').get(key);return row?z.object({total:z.number()}).parse(row).total:0;};
  const tasks=this.db.prepare('SELECT user_id,task,total FROM campus_ai_usage WHERE day=?').all(day).map(r=>z.object({user_id:z.string(),task:z.string(),total:z.number()}).parse(r)).filter(r=>ids.has(r.user_id));
  const jobs=this.db.prepare('SELECT a,status FROM campus_jobs').all().map(r=>z.object({a:z.string(),status:z.string()}).parse(r)).filter(r=>ids.has(r.a));
  const pushJobs=this.db.prepare('SELECT s.user_id,j.attempts FROM campus_push_jobs j JOIN campus_push_subscriptions s ON s.id=j.subscription_id JOIN auth_sessions a ON a.token_hash=s.session_hash WHERE a.expires_at>?').all(data.now).map(r=>z.object({user_id:z.string(),attempts:z.number()}).parse(r)).filter(r=>ids.has(r.user_id));
  return adminOverviewSchema.parse({generatedAt:data.now,scope,accounts:data.users.length,members:data.selected.length,complete:data.selected.filter(m=>m.complete).length,eligible:data.selected.filter(m=>campusMemberEligible(m)&&(m.verification!=='demo'||this.settings.sharedDemo)).length,activeLocations:data.locations.length,events:data.events.length,
   roles:histogram(data.selected.map(m=>m.role)),interests:histogram(data.selected.flatMap(m=>m.profile.interests)),
   matches:Object.fromEntries(['pending','mutual','declined','expired','revoked'].map(status=>[status,data.matches.filter(m=>m.status===status).length])),
   feedback:{responses:data.responses.length,ratedMatches:new Set(data.responses.map(r=>r.matchId)).size,eligibleParticipants:data.matches.filter(m=>m.answerA==='yes'&&m.answerB==='yes').length*2,averageRating:data.responses.length?data.responses.reduce((sum,r)=>sum+r.feedback.rating,0)/data.responses.length:null,ratings:[1,2,3,4,5].map(rating=>({rating,count:data.responses.filter(r=>r.feedback.rating===rating).length})),outcomes:histogram(data.responses.map(r=>r.feedback.outcome))},
   ai:{agent:this.campus.home(null).agent,day,liveAttempts:inference(day),demoAttempts:inference(day+':demo'),liveBudget:30,demoBudget:100,interestTasks:tasks.filter(r=>r.task==='interest').reduce((s,r)=>s+r.total,0),posterTasks:tasks.filter(r=>r.task==='poster').reduce((s,r)=>s+r.total,0),jobs:histogram(jobs.map(r=>r.status))},
   push:{configured:this.settings.pushConfigured,devices:data.users.reduce((s,u)=>s+u.pushDevices,0),pending:pushJobs.filter(j=>j.attempts===0).length,retrying:pushJobs.filter(j=>j.attempts>0&&j.attempts<3).length,exhausted:pushJobs.filter(j=>j.attempts>=3).length}
  });
 }
}
