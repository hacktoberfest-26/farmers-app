import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterAll,beforeAll,expect,it } from 'vitest';
import { buildServer } from '../server/src/app';
import { adminOverviewSchema,adminListSchema } from '../src/lib/campus-admin-model';
import { campusHomeSchema } from '../src/lib/campus-model';
const directory=mkdtempSync(join(tmpdir(),'farmers-admin-'));
const app=buildServer({sqlitePath:join(directory,'test.sqlite'),corsOrigin:'https://farmers.test',bootstrapAdminEmail:'operator@example.test',bootstrapAdminPassword:'operator-password-12345',campus:{ai:{model:'test',score:async()=>({score:90,reasonCodes:['shared_interests','shared_goal']}),normalise:async()=>null,readPoster:async()=>{throw new Error('Not used');}},scheduler:false,sharedDemo:{code:'test-passcode'}}});
const request=(method:'GET'|'POST',url:string,payload?:unknown,token?:string)=>app.inject({method,url,payload:payload===undefined?undefined:JSON.stringify(payload),headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})}});
let operator='',alice='',bob='',staff='',matchId='';
beforeAll(async()=>{
 operator=(await request('POST','/api/auth/login',{email:'operator@example.test',password:'operator-password-12345'})).json<{token:string}>().token;
 for(const alias of ['alex','mia','nina']){const token=(await request('POST','/api/campus/demo/sign-in',{code:'test-passcode',alias})).json<{token:string}>().token;if(alias==='alex')alice=token;else if(alias==='mia')bob=token;else staff=token;}
});
afterAll(async()=>{await app.close();rmSync(directory,{recursive:true,force:true});});
it('requires genuine operator access for every administrative read',async()=>{
 for(const section of ['overview','users','matches','locations','events','feedback']){
  expect((await request('GET',`/api/campus/admin/${section}`)).statusCode).toBe(401);
  for(const token of [alice,staff])expect((await request('GET',`/api/campus/admin/${section}`,undefined,token)).statusCode).toBe(403);
  const response=await request('GET',`/api/campus/admin/${section}`,undefined,operator);expect(response.statusCode).toBe(200);expect(response.headers['cache-control']).toBe('no-store');
 }
 expect((await request('GET','/api/campus/admin/users?limit=500',undefined,operator)).statusCode).toBe(400);
 expect((await request('GET','/api/campus/admin/users?scope=anything',undefined,operator)).statusCode).toBe(400);
});
it('pages/searches users with full totals, includes accounts without campus profiles and excludes private fields',async()=>{
 await request('POST','/api/auth/register',{name:'New Account',email:'new@example.test',password:'test-password',adult:true});
 const first=adminListSchema.parse((await request('GET','/api/campus/admin/users?scope=demo&limit=2',undefined,operator)).json());
 expect(first.total).toBe(12);expect(first.rows).toHaveLength(2);
 const next=adminListSchema.parse((await request('GET','/api/campus/admin/users?scope=demo&limit=2&page=1',undefined,operator)).json());
 expect(next.rows).not.toEqual(first.rows);
 const searched=adminListSchema.parse((await request('GET','/api/campus/admin/users?scope=live&q=new%40example',undefined,operator)).json());
 expect(searched.total).toBe(1);if(searched.section!=='users')throw new Error();expect(searched.rows[0].member).toBeNull();
 const home=campusHomeSchema.parse((await request('GET','/api/campus',undefined,alice)).json());
 await request('POST','/api/campus/profile',{...home.me!.profile,privateIdea:'SECRET STARTUP IDEA'},alice);
 const all=(await request('GET','/api/campus/admin/users',undefined,operator)).body;
 expect(all).not.toMatch(/SECRET STARTUP IDEA|privateIdea|password_hash|token_hash|p256dh|endpoint|salt/);
});
it('accepts private per-participant feedback only on mutual matches and upserts without duplicates',async()=>{
 await request('POST','/api/campus/admin/run-engine',{},operator);
 const before=campusHomeSchema.parse((await request('GET','/api/campus',undefined,alice)).json());matchId=before.suggestions[0].id;
 const input={rating:4,outcome:'met',comment:'Alice private feedback'};
 expect((await request('POST',`/api/campus/matches/${matchId}/feedback`,input,alice)).statusCode).toBe(409);
 expect((await request('POST',`/api/campus/matches/${matchId}/feedback`,input,staff)).statusCode).toBe(404);
 await request('POST',`/api/campus/matches/${matchId}/answer`,{answer:'yes'},alice);
 await request('POST',`/api/campus/matches/${matchId}/answer`,{answer:'yes'},bob);
 expect((await request('POST',`/api/campus/matches/${matchId}/feedback`,{...input,rating:6},alice)).statusCode).toBe(400);
 expect((await request('POST',`/api/campus/matches/${matchId}/feedback`,input,alice)).statusCode).toBe(200);
 expect((await request('GET','/api/campus',undefined,bob)).body).not.toContain(input.comment);
 expect((await request('POST',`/api/campus/matches/${matchId}/feedback`,{...input,rating:5,comment:'Updated private feedback'},alice)).statusCode).toBe(200);
 expect((await request('POST',`/api/campus/matches/${matchId}/feedback`,{rating:3,outcome:'planned',comment:'Bob private feedback'},bob)).statusCode).toBe(200);
 expect((await request('GET','/api/campus',undefined,alice)).body).not.toContain('Bob private feedback');
 const overview=adminOverviewSchema.parse((await request('GET','/api/campus/admin/overview?scope=demo',undefined,operator)).json());
 expect(overview.feedback).toMatchObject({responses:2,ratedMatches:1,eligibleParticipants:2,averageRating:4});
 const responses=adminListSchema.parse((await request('GET','/api/campus/admin/feedback?scope=demo&limit=1',undefined,operator)).json());
 expect(responses.total).toBe(2);expect(responses.rows).toHaveLength(1);
 expect((await request('GET','/api/campus/admin/feedback?scope=live',undefined,operator)).json().total).toBe(0);
});
it('shows active opt-in locations only, and keeps mutual matches past their original expiry',async()=>{
 const fix={latitude:45.606,longitude:12.439,accuracy:8,simulated:true};
 expect((await request('POST','/api/campus/map/location',fix,alice)).statusCode).toBe(200);
 const live=(await request('GET','/api/campus/admin/locations?scope=demo',undefined,operator)).json();
 expect(live.total).toBe(1);expect(live.rows[0].location.simulated).toBe(true);
 expect((await request('GET','/api/campus/admin/locations?scope=live',undefined,operator)).json().total).toBe(0);
 const db=new DatabaseSync(join(directory,'test.sqlite'));
 try{db.prepare('UPDATE campus_locations SET updated=?').run(Date.now()-120001);db.prepare('UPDATE campus_proposals SET expires=? WHERE id=?').run(Date.now()-1000,matchId);}finally{db.close();}
 expect((await request('GET','/api/campus/admin/locations',undefined,operator)).json().total).toBe(0);
 const matches=(await request('GET','/api/campus/admin/matches?status=mutual',undefined,operator)).json();expect(matches.rows.some((row:{id:string})=>row.id===matchId)).toBe(true);
 const home=campusHomeSchema.parse((await request('GET','/api/campus',undefined,alice)).json());
 await request('POST','/api/campus/profile',{...home.me!.profile,consent:{...home.me!.profile.consent,matching:false}},alice);
 expect((await request('POST',`/api/campus/matches/${matchId}/feedback`,{rating:1,outcome:'did-not-meet',comment:''},alice)).statusCode).toBe(409);
 expect((await request('GET','/api/campus/admin/feedback',undefined,operator)).json().total).toBe(2);
});
