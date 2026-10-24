import { createHash, createHmac, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { locationFixSchema, campusProfileSchema } from '../../src/lib/campus-model';
import { CampusError, CampusService } from './campus-service';
import type { CampusAI } from './backboard';
import type { CommunityStore } from './store';
import { CampusPush, type PushTransport } from './push';
import { pushEndpointSchema, pushSubscriptionSchema } from '../../src/lib/push-model';
import { seedSharedDemo, sharedDemoAccount } from './campus-shared-demo';

export type CampusOptions = { push?:PushTransport; ai:CampusAI|null; email?:{domains:string[];secret:string;sendCode:(email:string,code:string)=>Promise<void>}; sharedDemo?:{code:string}; scheduler?:boolean; recoverOnStart?:boolean };
const emailInput=z.object({email:z.email().transform(value=>value.trim().toLowerCase())});
const challengeRow=z.object({id:z.string(),email:z.string(),code_hash:z.string(),expires:z.number(),attempts:z.number(),consumed:z.number().nullable()});
const errorResponse={error:'Enter valid details and try again'};
export function registerCampusRoutes(app:FastifyInstance,store:CommunityStore,authenticate:(request:FastifyRequest)=>string|null,options:CampusOptions) {
  const db=store.db;
  const email=options.email;
  const campus=new CampusService(db,{ai:options.ai,notify:(id,recipients,kind)=>push.enqueue(id,recipients,kind),auth:{emailEnabled:!!email,domains:email?.domains??[],sharedDemo:!!options.sharedDemo}});
  const push=new CampusPush(db,options.push,(userId,proposalId,kind)=>campus.home(userId).suggestions.some(match=>match.id===proposalId && match.kind===(kind==='match'?'revealed':'anonymous')));
  if(options.recoverOnStart)campus.recoverInterruptedRun();
  if(options.sharedDemo)seedSharedDemo(store,campus);
  db.exec(`CREATE TABLE IF NOT EXISTS campus_otp(id TEXT PRIMARY KEY,email TEXT NOT NULL,code_hash TEXT NOT NULL,expires INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,consumed INTEGER,created INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS campus_otp_email ON campus_otp(email,created);
    CREATE TABLE IF NOT EXISTS campus_affiliations(user_id TEXT PRIMARY KEY REFERENCES auth_users(id) ON DELETE CASCADE,email TEXT NOT NULL,verified_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS campus_ai_usage(user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,day TEXT NOT NULL,task TEXT NOT NULL,total INTEGER NOT NULL,PRIMARY KEY(user_id,day,task));`);
  const reserveTask=(id:string,task:'interest'|'poster',limit:number)=>{
    const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    const result=db.prepare('INSERT INTO campus_ai_usage(user_id,day,task,total) VALUES(?,?,?,1) ON CONFLICT(user_id,day,task) DO UPDATE SET total=total+1 WHERE total<?').run(id,day,task,limit);
    if(result.changes!==1)throw new CampusError(429,'Daily AI task limit reached. Try again tomorrow.');
  };
  const ensure=(id:string)=>{
    const account=store.userById(id);
    if(!account)throw new CampusError(401,'Sign in required');
    const old=store.readState().profiles.find(person=>person.id===id);
    const proof=db.prepare('SELECT 1 FROM campus_affiliations WHERE user_id=? AND email=?').get(id,account.email);
    const member=campus.ensureMember({id,email:account.email,name:old?.name??'Campus member',role:old?.role==='admin'?'admin':'student',verification:old?.role==='admin'?'operator':proof?'email':'unverified'});
    if(member.verification==='demo'&&!options.sharedDemo)throw new CampusError(403,'Shared demo is not enabled');
    return member;
  };
  const actor=(request:FastifyRequest)=>{const id=authenticate(request);if(!id)throw new CampusError(401,'Sign in required');ensure(id);return id;};
  const guarded=(handler:(request:FastifyRequest)=>unknown|Promise<unknown>)=>async(request:FastifyRequest,reply:import('fastify').FastifyReply)=>{
    try{return await handler(request);}catch(error){
      if(error instanceof CampusError)return reply.code(error.statusCode).send({error:error.message});
      if(error instanceof z.ZodError)return reply.code(400).send(errorResponse);
      request.log.error({category:'campus_operation_failed'},'Campus operation failed');
      return reply.code(503).send({error:'The campus service is temporarily unavailable. Please try again.'});
    }
  };
  app.get('/api/campus',guarded(request=>{
    const id=authenticate(request);
    if(request.headers.authorization&&!id)throw new CampusError(401,'Your session expired. Sign in again.');
    if(id)ensure(id);
    return campus.home(id);
  }));
  const pushToken=(request:FastifyRequest)=>{actor(request);return request.headers.authorization!.slice(7);};
  app.post('/api/campus/push/status',guarded(request=>{
    const {endpoint}=z.object({endpoint:pushEndpointSchema.nullable()}).parse(request.body);
    return push.status(pushToken(request),endpoint);
  }));
  app.post('/api/campus/push/subscribe',guarded(request=>{
    const {subscription,locale}=z.object({subscription:pushSubscriptionSchema,locale:z.enum(['en','it'])}).parse(request.body);
    return push.subscribe(pushToken(request),subscription,locale);
  }));
  app.post('/api/campus/push/unsubscribe',guarded(request=>{
    const {endpoint}=z.object({endpoint:pushEndpointSchema}).parse(request.body);
    return push.unsubscribe(pushToken(request),endpoint);
  }));
  app.post('/api/campus/push/test',{config:{rateLimit:{max:3,timeWindow:'1 minute'}}},guarded(request=>{
    const {endpoint}=z.object({endpoint:pushEndpointSchema}).parse(request.body);
    return push.test(pushToken(request),endpoint);
  }));
  const pushTimer=setInterval(()=>{void push.flush().catch(()=>app.log.error({category:'push_delivery_failed'},'Push delivery failed'));},5000);
  pushTimer.unref();
  app.addHook('onClose',async()=>{clearInterval(pushTimer);await push.flush();});
  app.get('/api/campus/map',guarded(request=>campus.map(actor(request))));
  app.post('/api/campus/map/location',guarded(request=>campus.shareLocation(actor(request),locationFixSchema.nullable().parse(request.body))));
  app.post('/api/campus/profile',guarded(request=>campus.saveProfile(actor(request),campusProfileSchema.parse(request.body))));
  app.post('/api/campus/demo/sign-in',{config:{rateLimit:{max:15,timeWindow:'1 minute'}}},guarded(request=>{
    const {code,alias}=z.object({code:z.string().min(1).max(128),alias:z.string().max(30)}).parse(request.body);
    const configured=options.sharedDemo;
    if(!configured)throw new CampusError(503,'Shared demo is not enabled');
    const digest=(value:string)=>createHash('sha256').update(value).digest();
    if(!timingSafeEqual(digest(code),digest(configured.code)))throw new CampusError(401,'Invalid shared-demo access code');
    const account=sharedDemoAccount(store,campus,alias);
    return {token:store.createSession(account.id,24*60*60_000),userId:account.id};
  }));
  app.post('/api/campus/demo/switch',guarded(request=>{
    const id=actor(request);
    if(!options.sharedDemo||campus.member(id)?.verification!=='demo')throw new CampusError(403,'Shared fictional demo access required');
    const {alias}=z.object({alias:z.string().max(30)}).parse(request.body);
    const account=sharedDemoAccount(store,campus,alias);
    const previous=/^Bearer ([A-Za-z0-9_-]{20,200})$/.exec(request.headers.authorization??'')?.[1];
    if(previous)store.revokeSession(previous);
    return {token:store.createSession(account.id,24*60*60_000),userId:account.id};
  }));
  app.post('/api/campus/demo/run-engine',{config:{rateLimit:{max:2,timeWindow:'1 minute'}}},guarded(async request=>{
    const me=ensure(actor(request));
    if(!options.sharedDemo||me.verification!=='demo')throw new CampusError(403,'Shared fictional demo access required');
    if(!options.ai)return {scanned:0,scored:0,published:0,status:'unavailable'};
    if(campus.home(me.id).agent.status==='running')return {scanned:0,scored:0,published:0,status:'busy'};
    void campus.runEngine('demo').catch(()=>app.log.error({category:'shared_demo_engine_failed'},'Shared demo matching failed'));
    return {scanned:0,scored:0,published:0,status:'started'};
  }));
  app.post('/api/campus/admin/reset-demo',{config:{rateLimit:{max:2,timeWindow:'1 minute'}}},guarded(request=>{
    z.object({confirmation:z.literal('RESET DEMO')}).parse(request.body);
    return campus.resetDemo(actor(request));
  }));
  app.post('/api/campus/matches/:id/answer',guarded(request=>{
    const {id}=z.object({id:z.string().max(100)}).parse(request.params);
    const {answer}=z.object({answer:z.enum(['yes','no'])}).parse(request.body);
    return campus.answer(actor(request),id,answer);
  }));
  app.post('/api/campus/auth/request-code',{config:{rateLimit:{max:5,timeWindow:'1 minute'}}},guarded(async request=>{
    const {email:address}=emailInput.parse(request.body);
    if(!email)throw new CampusError(503,'University email sign-in is not configured yet. Use the fictional demo or operator access.');
    if(!email.domains.includes(address.split('@')[1]))throw new CampusError(400,'Use an approved university email domain');
    const recent=db.prepare('SELECT 1 FROM campus_otp WHERE email=? AND created>?').get(address,Date.now()-60_000);
    if(recent)throw new CampusError(429,'Wait a minute before requesting another code');
    db.prepare('DELETE FROM campus_otp WHERE expires<?').run(Date.now()-24*60*60_000);
    const id=randomUUID(),code=String(randomInt(100000,1000000)),expires=Date.now()+10*60_000;
    const hash=createHmac('sha256',email.secret).update(`${id}:${code}`).digest('hex');
    db.prepare('INSERT INTO campus_otp(id,email,code_hash,expires,created) VALUES(?,?,?,?,?)').run(id,address,hash,expires,Date.now());
    try{await email.sendCode(address,code);}catch{db.prepare('DELETE FROM campus_otp WHERE id=?').run(id);throw new CampusError(503,'We could not send your code. Please try again later.');}
    return {challengeId:id,expiresAt:new Date(expires).toISOString()};
  }));
  app.post('/api/campus/auth/verify',{config:{rateLimit:{max:10,timeWindow:'1 minute'}}},guarded(request=>{
    const {challengeId,code}=z.object({challengeId:z.uuid(),code:z.string().regex(/^\d{6}$/)}).parse(request.body);
    if(!email)throw new CampusError(503,'University email sign-in is not configured yet');
    const raw=db.prepare('SELECT * FROM campus_otp WHERE id=?').get(challengeId);
    const row=raw?challengeRow.parse(raw):null;
    if(!row||row.expires<=Date.now()||row.consumed!==null||row.attempts>=5)throw new CampusError(400,'Invalid or expired code');
    db.prepare('UPDATE campus_otp SET attempts=attempts+1 WHERE id=?').run(challengeId);
    const hash=createHmac('sha256',email.secret).update(`${challengeId}:${code}`).digest('hex');
    if(!timingSafeEqual(Buffer.from(hash,'hex'),Buffer.from(row.code_hash,'hex')))throw new CampusError(400,'Invalid or expired code');
    db.exec('BEGIN IMMEDIATE');
    let account:{id:string;email:string};
    try{
      const changed=db.prepare('UPDATE campus_otp SET consumed=? WHERE id=? AND consumed IS NULL').run(Date.now(),challengeId);
      if(changed.changes!==1)throw new CampusError(400,'Invalid or expired code');
      account=store.createOtpUser(row.email);
      db.prepare('INSERT INTO campus_affiliations(user_id,email,verified_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET email=excluded.email,verified_at=excluded.verified_at').run(account.id,account.email,Date.now());
      db.exec('COMMIT');
    }catch(error){db.exec('ROLLBACK');throw error;}
    ensure(account.id);
    return {token:store.createSession(account.id),userId:account.id};
  }));
  app.post('/api/campus/interests/normalise',{config:{rateLimit:{max:10,timeWindow:'1 hour'}}},guarded(async request=>{
    const me=ensure(actor(request));
    const {text}=z.object({text:z.string().trim().min(2).max(200),consent:z.literal(true)}).parse(request.body);
    if(me.verification==='unverified')throw new CampusError(403,'Verify your university email before using hosted AI');
    if(!options.ai)throw new CampusError(503,'Gemma is not configured yet');
    reserveTask(me.id,'interest',10);
    return {categoryId:await options.ai.normalise(text)};
  }));
  app.get('/api/campus/export',guarded(request=>campus.exportSelf(actor(request))));
  app.post('/api/campus/delete',guarded(async request=>{
    z.object({confirmation:z.literal('DELETE')}).parse(request.body);
    const id=actor(request),me=campus.member(id);
    if(me?.verification==='demo')throw new CampusError(403,'Shared fictional personas are managed by the presenter. Use the operator demo reset.');
    if(me?.role==='admin')throw new CampusError(403,'The deployment operator must transfer administration before deleting this account');
    if(me)db.prepare('DELETE FROM campus_otp WHERE email=?').run(me.email);
    store.deleteAccount(id);
    return {deleted:true};
  }));
  app.post('/api/campus/admin/run-engine',{config:{rateLimit:{max:2,timeWindow:'1 minute'}}},guarded(async request=>{
    if(ensure(actor(request)).role!=='admin')throw new CampusError(403,'Administrator access required');
    return campus.runEngine();
  }));
  app.post('/api/campus/events/from-image',{bodyLimit:3*1024*1024,config:{rateLimit:{max:3,timeWindow:'1 hour'}}},guarded(async request=>{
    const id=actor(request),me=ensure(id);
    if(!['staff','admin'].includes(me.role)||me.verification==='unverified')throw new CampusError(403,'Staff access required');
    const {image}=z.object({image:z.string().max(2900000).regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/),consent:z.literal(true)}).parse(request.body);
    if(!me.profile.consent.hostedAi||!options.ai)throw new CampusError(403,'Enable hosted AI consent before reading a poster');
    reserveTask(id,'poster',3);
    const event=await options.ai.readPoster(image);
    return campus.addEvent(id,{...event,id:randomUUID(),source:'poster'});
  }));
  if(options.scheduler!==false) {
    const timer=setInterval(()=>{void campus.runEngine().catch(()=>app.log.error({category:'campus_engine_failed'},'Campus matching run failed'));},5*60_000);
    timer.unref();
    app.addHook('onClose',async()=>clearInterval(timer));
  }
  return campus;
}
