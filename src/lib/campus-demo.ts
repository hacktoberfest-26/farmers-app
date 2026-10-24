import { z } from 'zod';
import { campusMemberSchema, campusProfileSchema, colours, initialCampusProfile, interests, type CampusHome, type CampusMember, type CampusProfileInput, type EngineReport, type MatchType, type MatchView } from './campus-model';
import type { CampusClient } from './campus-client';

const demoProposalSchema = z.object({ id: z.string(), a: z.string(), b: z.string(), kind: z.enum(['cofounder', 'sport', 'lunch']), answerA: z.enum(['pending', 'yes', 'no']), answerB: z.enum(['pending', 'yes', 'no']), createdAt: z.string(), expiresAt: z.string(), revoked: z.boolean().default(false) });
const demoStateSchema = z.object({ version: z.literal(1), viewerId: z.string(), members: z.array(campusMemberSchema), proposals: z.array(demoProposalSchema), lastRun: z.string().nullable() });
type DemoState = z.infer<typeof demoStateSchema>;
const storageKey = 'farmers-campus-fictional-demo-v1';
const names = ['Alex Neri', 'Mia Verde', 'Leo Riva', 'Eva Serra', 'Noah Luni', 'Ada Bosco', 'Luca Valli', 'Iris Sole', 'Nico Fiore', 'Alma Lago', 'Teo Costa', 'Nina Prati'];
function seedDemo(): DemoState {
  const members: CampusMember[] = names.map((name, index) => ({
    id: index === 0 ? 'you' : `fictional-${index}`, email: `person${index}@fictional.example`, role: index === 11 ? 'staff' : 'student', verification: 'operator', complete: index !== 0, revision: 1,
    profile: { ...initialCampusProfile(name), course: index % 2 ? 'Digital Business' : 'Interaction Design', year: '2', interests: index % 3 === 0 ? ['technology', 'design', 'community'] : index % 3 === 1 ? ['business', 'technology', 'sustainability'] : ['arts', 'design', 'community'], skills: index % 2 ? ['business', 'marketing'] : ['engineering', 'design'], lookingFor: ['cofounder', 'join-project', 'lunch', 'sport'], colour: colours[index % colours.length] ?? colours[0], consent: { matching: true, hostedAi: false, events: true, resources: true }, sports: [{ sport: 'padel', level: 'beginner', days: [1, 3], slots: ['afternoon'] }] },
  }));
  return { version: 1, viewerId: 'you', members, proposals: [], lastRun: null };
}
function readDemo(): DemoState {
  try { const raw = localStorage.getItem(storageKey); if (raw) { const parsed = demoStateSchema.safeParse(JSON.parse(raw)); if (parsed.success) return parsed.data; } } catch { /* An unavailable browser store still permits an in-memory demo. */ }
  return seedDemo();
}
function dayKey(date: string): string { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(date)); }
export class DemoCampusClient implements CampusClient {
  readonly mode = 'demo';
  private state: DemoState = readDemo();
  private save() { try { localStorage.setItem(storageKey, JSON.stringify(this.state)); } catch { /* Browser storage may be disabled. */ } }
  private me(): CampusMember { const me = this.state.members.find(member => member.id === this.state.viewerId); if (!me) throw new Error('Choose a fictional demo account.'); return me; }
  async home(): Promise<CampusHome> {
    const me = this.me();
    const suggestions: MatchView[] = [];
    for (const proposal of this.state.proposals) {
      if (proposal.revoked || ![proposal.a, proposal.b].includes(me.id) || proposal.answerA === 'no' || proposal.answerB === 'no' || new Date(proposal.expiresAt).getTime() <= Date.now()) continue;
      const other = this.state.members.find(member => member.id === (proposal.a === me.id ? proposal.b : proposal.a));
      if (!other || !me.profile.consent.matching || !other.profile.consent.matching) continue;
      const fields = { id: proposal.id, matchType: proposal.kind, avatar: { colour: other.profile.colour, interests: other.profile.interests }, reasons: proposal.kind === 'sport' ? ['same_sport', 'shared_availability'] satisfies MatchView['reasons'] : ['shared_interests', 'shared_goal'] satisfies MatchView['reasons'], expiresAt: proposal.expiresAt };
      suggestions.push(proposal.answerA === 'yes' && proposal.answerB === 'yes'
        ? { ...fields, kind: 'revealed', person: { name: other.profile.name, course: other.profile.course, year: other.profile.year, email: other.email } }
        : { ...fields, kind: 'anonymous', myAnswer: proposal.a === me.id ? proposal.answerA : proposal.answerB });
    }
    return { me: structuredClone(me), suggestions, events: me.profile.consent.events ? [{ id: 'fictional-event', title: 'Ideas over coffee', date: new Date(Date.now() + 86400000 * 2).toISOString(), place: 'Campus café · fictional example', topics: ['business', 'community'], source: 'demo' }] : [], alerts: me.role === 'staff' ? [{ id: 'fictional-guest', title: 'A climate-tech guest is visiting', body: 'Fictional example: two startup teams share this guest’s interests. A staff member could offer an introduction with consent.', status: 'open' }] : [], agent: { configured: false, model: 'Local rules demonstration · no AI', status: 'not-configured', lastRun: this.state.lastRun }, auth: { emailEnabled: false, domains: [], sharedDemo: false }, demo: true };
  }
  async saveProfile(profile: CampusProfileInput): Promise<CampusHome> { const me = this.me(); const next = campusProfileSchema.parse(profile); if (me.profile.consent.matching && !next.consent.matching) for (const proposal of this.state.proposals) { if ([proposal.a, proposal.b].includes(me.id)) proposal.revoked = true; } me.profile = next; me.complete = true; me.revision += 1; this.save(); await this.runEngine(); return this.home(); }
  async answer(id: string, answer: 'yes' | 'no'): Promise<CampusHome> {
    const me = this.me(); const proposal = this.state.proposals.find(item => item.id === id && [item.a, item.b].includes(me.id));
    if (!proposal || proposal.revoked || new Date(proposal.expiresAt).getTime() <= Date.now() || proposal.answerA === 'no' || proposal.answerB === 'no') throw new Error('This suggestion is no longer available.');
    const previous = proposal.a === me.id ? proposal.answerA : proposal.answerB;
    if (previous !== 'pending' && previous !== answer) throw new Error('Your answer has already been saved.');
    if (proposal.a === me.id) proposal.answerA = answer; else proposal.answerB = answer;
    this.save(); return this.home();
  }
  async runEngine(): Promise<EngineReport> {
    const me = this.me(); const now = new Date().toISOString(); const day = dayKey(now); let scanned = 0; let published = 0;
    const count = (id: string) => this.state.proposals.filter(proposal => [proposal.a, proposal.b].includes(id) && dayKey(proposal.createdAt) === day).length;
    if (me.complete && me.profile.consent.matching) for (const candidate of this.state.members) {
      if (candidate.id === me.id || !candidate.complete || !candidate.profile.consent.matching) continue;
      scanned += 1;
      if (count(me.id) >= 3 || count(candidate.id) >= 3 || this.state.proposals.some(p => [p.a, p.b].includes(me.id) && [p.a, p.b].includes(candidate.id))) continue;
      const shared = me.profile.interests.some(interest => candidate.profile.interests.includes(interest));
      let kind: MatchType | null = null;
      if (shared && ((me.profile.lookingFor.includes('cofounder') && candidate.profile.lookingFor.includes('join-project')) || (me.profile.lookingFor.includes('join-project') && candidate.profile.lookingFor.includes('cofounder')))) kind = 'cofounder';
      else if (shared && me.profile.lookingFor.includes('lunch') && candidate.profile.lookingFor.includes('lunch')) kind = 'lunch';
      else if (me.profile.lookingFor.includes('sport') && candidate.profile.lookingFor.includes('sport') && me.profile.sports.some(a => candidate.profile.sports.some(b => a.sport === b.sport && a.level === b.level && a.days.some(d => b.days.includes(d)) && a.slots.some(s => b.slots.includes(s))))) kind = 'sport';
      if (!kind) continue;
      this.state.proposals.push({ id: crypto.randomUUID(), a: me.id, b: candidate.id, kind, answerA: 'pending', answerB: 'pending', revoked: false, createdAt: now, expiresAt: new Date(Date.now() + 86400000 * 3).toISOString() }); published += 1;
    }
    this.state.lastRun = now; this.save(); return { scanned, scored: 0, published, status: 'completed' };
  }
  async normaliseInterest(text: string) { const query = text.toLocaleLowerCase(); const category = interests.find(item => `${item.id} ${item.en} ${item.it}`.toLocaleLowerCase().includes(query)); return { categoryId: category?.id ?? null }; }
  async requestCode(): Promise<never> { throw new Error('University sign-in is separate from the fictional local demo.'); }
  async verifyCode(): Promise<never> { throw new Error('University sign-in is separate from the fictional local demo.'); }
  async signIn(): Promise<never> { throw new Error('Use the demo account controls to change fictional person.'); }
  async signInSharedDemo(): Promise<never> { throw new Error('Exit the local rules preview to sign into the shared Gemma demo.'); }
  async resetSharedDemo(): Promise<never> { throw new Error('Only a live operator can reset the shared fictional demo.'); }
  async signOut() { this.state.viewerId = 'you'; this.save(); }
  async uploadPoster(): Promise<never> { throw new Error('Poster reading needs the live hosted AI service. This local demo does not call an AI provider.'); }
  async exportProfile(): Promise<unknown> { const home = await this.home(); return { fictionalDemo: true, me: home.me, suggestions: home.suggestions }; }
  async deleteProfile() { this.state = seedDemo(); this.save(); }
  demoAccounts() { return this.state.members.map(member => ({ id: member.id, name: member.profile.name })); }
  async switchDemo(id: string) { if (!this.state.members.some(member => member.id === id)) throw new Error('Unknown fictional account.'); this.state.viewerId = id; this.save(); return this.home(); }
}
