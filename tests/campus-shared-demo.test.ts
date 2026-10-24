import { afterAll, expect, it } from 'vitest';
import { buildServer } from '../server/src/app';
import { campusHomeSchema } from '../src/lib/campus-model';
import type { CampusAI } from '../server/src/backboard';

let scored=0;
const ai:CampusAI={model:'external-provider-test',score:async()=>{scored++;return{score:90,reasonCodes:['shared_interests','same_sport','shared_goal']};},normalise:async()=> 'technology',readPoster:async()=>({title:'Demo poster event',date:'2030-01-01T10:00:00.000Z',place:'Fictional hall',topics:['technology']})};
const app=buildServer({sqlitePath:':memory:',corsOrigin:'https://farmers.test',bootstrapAdminEmail:'operator@example.test',bootstrapAdminPassword:'operator-only-strong-password',campus:{ai,sharedDemo:{code:'test-demo-code'},scheduler:false}});
const request=(method:'GET'|'POST',url:string,body?:unknown,token?:string)=>app.inject({method,url,payload:body?JSON.stringify(body):undefined,headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})}});
const tokens:Record<string,string>={};
afterAll(async()=>app.close());

it('requires the access code and creates independent server sessions for fictional people',async()=>{
  expect((await request('GET','/api/campus')).json().auth.sharedDemo).toBe(true);
  expect((await request('POST','/api/campus/demo/sign-in',{code:'incorrect-code',alias:'alex'})).statusCode).toBe(401);
  for(const alias of ['alex','mia','nina']) {
    const signed=await request('POST','/api/campus/demo/sign-in',{code:'test-demo-code',alias});
    expect(signed.statusCode).toBe(200);
    tokens[alias]=signed.json<{token:string}>().token;
    const home=campusHomeSchema.parse((await request('GET','/api/campus',undefined,tokens[alias])).json());
    expect(home.demo).toBe(true);
    expect(home.agent.configured).toBe(true);
    expect(home.me?.verification).toBe('demo');
  }
  expect(tokens.alex).not.toBe(tokens.mia);
});

it('uses the real inference boundary and shares consent decisions between two device sessions',async()=>{
  const report=await request('POST','/api/campus/demo/run-engine',{},tokens.alex);
  expect(report.statusCode).toBe(200);
  expect(scored).toBeGreaterThan(0);
  const alex=campusHomeSchema.parse((await request('GET','/api/campus',undefined,tokens.alex)).json());
  const mia=campusHomeSchema.parse((await request('GET','/api/campus',undefined,tokens.mia)).json());
  const common=alex.suggestions.find(card=>mia.suggestions.some(other=>other.id===card.id));
  expect(common?.kind).toBe('anonymous');
  expect(common).toBeDefined();
  if(!common)throw new Error('Expected the presentation pair');
  expect(JSON.stringify(alex.suggestions)).not.toContain('Mia Verde');
  await request('POST',`/api/campus/matches/${common.id}/answer`,{answer:'yes'},tokens.alex);
  const first=campusHomeSchema.parse((await request('GET','/api/campus',undefined,tokens.mia)).json());
  expect(first.suggestions.find(card=>card.id===common.id)?.kind).toBe('anonymous');
  await request('POST',`/api/campus/matches/${common.id}/answer`,{answer:'yes'},tokens.mia);
  const both=campusHomeSchema.parse((await request('GET','/api/campus',undefined,tokens.alex)).json());
  expect(both.suggestions.find(card=>card.id===common.id)).toMatchObject({kind:'revealed',person:{name:'Mia Verde'}});
});

it('does not grant fictional people administrator access and revokes only the switching device session',async()=>{
  expect((await request('POST','/api/campus/delete',{confirmation:'DELETE'},tokens.alex)).statusCode).toBe(403);
  expect((await request('POST','/api/campus/admin/reset-demo',{confirmation:'RESET DEMO'},tokens.nina)).statusCode).toBe(403);
  expect((await request('POST','/api/campus/admin/run-engine',{},tokens.alex)).statusCode).toBe(403);
  const switched=await request('POST','/api/campus/demo/switch',{alias:'leo'},tokens.alex);
  expect(switched.statusCode).toBe(200);
  expect((await request('GET','/api/campus',undefined,tokens.alex)).statusCode).toBe(401);
  expect((await request('GET','/api/campus',undefined,tokens.mia)).statusCode).toBe(200);
  const operator=await request('POST','/api/auth/login',{email:'operator@example.test',password:'operator-only-strong-password'});
  const token=operator.json<{token:string}>().token;
  expect((await request('POST','/api/campus/admin/reset-demo',{confirmation:'RESET DEMO'},token)).statusCode).toBe(200);
  const reset=campusHomeSchema.parse((await request('GET','/api/campus',undefined,tokens.mia)).json());
  expect(reset.suggestions).toEqual([]);
  expect(reset.me?.profile.name).toBe('Mia Verde');
});
