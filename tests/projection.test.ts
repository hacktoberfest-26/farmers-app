import { describe,expect,it } from 'vitest';
import { createSeed } from '../src/lib/seed';
import { stateSchema,venueSchema } from '../src/lib/model';
import { projectState } from '../server/src/project';
const preferences={saved:[],likes:[],notifications:[]};
describe('shared API privacy projections',()=>{
 it('lets administrators review pending members without exposing them to other members',()=>{
  const state=createSeed();const source=state.profiles.find(p=>p.id==='emma-ricci');if(!source)throw new Error('fixture missing');source.role='pending';source.discoverable=false;
  expect(projectState(state,'you',preferences).profiles.some(p=>p.id===source.id)).toBe(true);
  expect(projectState(state,'marco-bianchi',preferences).profiles.some(p=>p.id===source.id)).toBe(false);
 });
 it('restricts session applicants and invitees to the organizer and the affected person',()=>{
  const state=createSeed();const session=state.sessions[0];session.pending=['emma-ricci'];session.waitlist=['giulia-conti'];session.invited=['marco-bianchi','chiara-romano'];
  const projected=projectState(state,'marco-bianchi',preferences).sessions.find(s=>s.id===session.id);
  expect(projected?.pending).toEqual([]);expect(projected?.waitlist).toEqual([]);expect(projected?.invited).toEqual(['marco-bianchi']);
  const organizer=projectState(state,session.organizerId,preferences).sessions.find(s=>s.id===session.id);
  expect(organizer?.pending).toEqual(['emma-ricci']);expect(organizer?.invited).toHaveLength(2);
 });
 it('rejects executable booking URLs and invalid timezone values at the data boundary',()=>{
  const seed=createSeed();expect(venueSchema.safeParse({...seed.venues[0],bookingUrl:'javascript:alert(1)'}).success).toBe(false);
  seed.profiles[0].timezone='not/a-timezone';expect(stateSchema.safeParse(seed).success).toBe(false);
 });
});
