import { afterAll, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildServer } from '../server/src/app';
import { campusHomeSchema, initialCampusProfile } from '../src/lib/campus-model';
import type { CampusAI } from '../server/src/backboard';

const directory=mkdtempSync(join(tmpdir(),'farmers-campus-http-'));
const deliveries=new Map<string,string>();
const ai:CampusAI={model:'test-external-boundary',score:async()=>({score:90,reasonCodes:['shared_interests','complementary_skills']}),normalise:async()=> 'technology',readPoster:async()=>({title:'Design day',date:'2030-01-01T10:00:00.000Z',place:'Demo room',topics:['design']})};
const app=buildServer({sqlitePath:join(directory,'test.sqlite'),corsOrigin:'https://farmers.test',bootstrapAdminEmail:'operator@example.test',bootstrapAdminPassword:'operator-password-at-least16',campus:{ai,scheduler:false,email:{domains:['campus.test'],secret:'test-secret-used-only-for-code-hashing',sendCode:async(email,code)=>{deliveries.set(email,code);}}}});
const request=(method:'GET'|'POST',url:string,body?:unknown,token?:string)=>app.inject({method,url,payload:body?JSON.stringify(body):undefined,headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})}});
const tokens:Record<string,string>={};
afterAll(async()=>{await app.close();rmSync(directory,{recursive:true,force:true});});

it('requires real email proof, consumes codes once, and never returns the code to the client',async()=>{
  expect((await request('GET','/api/campus')).json().auth.emailEnabled).toBe(true);
  expect((await request('POST','/api/campus/auth/request-code',{email:'person@elsewhere.test'})).statusCode).toBe(400);
  for(const name of ['alice','bob']) {
    const challenge=await request('POST','/api/campus/auth/request-code',{email:`${name}@campus.test`});
    expect(challenge.statusCode).toBe(200);
    const body=challenge.json<{challengeId:string;expiresAt:string}>();
    expect(Object.keys(body).sort()).toEqual(['challengeId','expiresAt']);
    const code=deliveries.get(`${name}@campus.test`);
    expect(code).toMatch(/^\d{6}$/);
    expect((await request('POST','/api/campus/auth/verify',{challengeId:body.challengeId,code:'000000'})).statusCode).toBe(400);
    const verified=await request('POST','/api/campus/auth/verify',{challengeId:body.challengeId,code});
    expect(verified.statusCode).toBe(200);
    tokens[name]=verified.json<{token:string}>().token;
    expect((await request('POST','/api/campus/auth/verify',{challengeId:body.challengeId,code})).statusCode).toBe(400);
    const home=campusHomeSchema.parse((await request('GET','/api/campus',undefined,tokens[name])).json());
    expect(home.me?.verification).toBe('email');
    expect(home.me?.role).toBe('student');
  }
});

it('runs the protected engine and reveals identity only after two independent HTTP answers',async()=>{
  const login=await request('POST','/api/auth/login',{email:'operator@example.test',password:'operator-password-at-least16'});
  tokens.operator=login.json<{token:string}>().token;
  for(const name of ['alice','bob']) {
    const profile={...initialCampusProfile(`${name} Private Name`),course:`${name} course`,privateIdea:`${name} private startup idea`,skills:[name==='alice'?'engineering':'design'],lookingFor:[name==='alice'?'cofounder':'join-project'],consent:{matching:true,hostedAi:true,events:false,resources:false}};
    expect((await request('POST','/api/campus/profile',profile,tokens[name])).statusCode).toBe(200);
  }
  expect((await request('POST','/api/campus/admin/run-engine',{},tokens.alice)).statusCode).toBe(403);
  const report=await request('POST','/api/campus/admin/run-engine',{},tokens.operator);
  expect(report.json()).toMatchObject({published:1,status:'completed'});
  const before=campusHomeSchema.parse((await request('GET','/api/campus',undefined,tokens.alice)).json());
  const card=before.suggestions[0];
  expect(card?.kind).toBe('anonymous');
  expect(JSON.stringify(before)).not.toContain('bob Private Name');
  expect(JSON.stringify(before)).not.toContain('bob@campus.test');
  expect(JSON.stringify(before)).not.toContain('bob private startup idea');
  const first=campusHomeSchema.parse((await request('POST',`/api/campus/matches/${card.id}/answer`,{answer:'yes'},tokens.alice)).json());
  expect(first.suggestions[0]).toMatchObject({kind:'anonymous',myAnswer:'yes'});
  expect((await request('POST',`/api/campus/matches/${card.id}/answer`,{answer:'yes'},tokens.operator)).statusCode).toBe(404);
  const both=campusHomeSchema.parse((await request('POST',`/api/campus/matches/${card.id}/answer`,{answer:'yes'},tokens.bob)).json());
  expect(both.suggestions[0]).toMatchObject({kind:'revealed',person:{name:'alice Private Name',email:'alice@campus.test'}});
  expect(JSON.stringify(both)).not.toContain('alice private startup idea');
});

it('blocks archive routes from bypassing campus privacy, including administrator projections',async()=>{
  const legacy=await request('GET','/api/community',undefined,tokens.operator);
  expect(legacy.statusCode).toBe(200);
  expect(legacy.json().profiles).toEqual([]);
  expect(JSON.stringify(legacy.json())).not.toContain('alice Private Name');
  expect((await request('POST','/api/commands',{type:'notifications.read'},tokens.alice)).statusCode).toBe(403);
  expect((await request('GET','/api/export',undefined,tokens.alice)).statusCode).toBe(403);
  const own=await request('GET','/api/campus/export',undefined,tokens.alice);
  expect(own.json().profile.profile.privateIdea).toBe('alice private startup idea');
  expect(JSON.stringify(own.json())).not.toContain('bob private startup idea');
});

it('requires explicit normalisation consent and removes account data and sessions on deletion',async()=>{
  expect((await request('POST','/api/campus/interests/normalise',{text:'robotics'},tokens.alice)).statusCode).toBe(400);
  expect((await request('POST','/api/campus/interests/normalise',{text:'robotics',consent:true},tokens.alice)).json()).toEqual({categoryId:'technology'});
  const removed=await request('POST','/api/campus/delete',{confirmation:'DELETE'},tokens.bob);
  expect(removed.statusCode).toBe(200);
  expect((await request('GET','/api/campus',undefined,tokens.bob)).statusCode).toBe(401);
  const survivor=campusHomeSchema.parse((await request('GET','/api/campus',undefined,tokens.alice)).json());
  expect(survivor.suggestions).toEqual([]);
});
