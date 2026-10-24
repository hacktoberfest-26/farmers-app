import { refreshDemoEvents } from './campus-demo-events';
import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { anonymousPair } from '../../packages/anonymiser';
import {
  feedbackInputSchema, matchFeedbackSchema, campusMemberEligible, type FeedbackInput, locationFixSchema, sharedLocationSchema, type LocationFix, type CampusMapState, campusEventSchema, campusHomeSchema, campusMemberSchema, campusProfileSchema, goalId,
  initialCampusProfile, interestId, judgementSchema, skillId, sportId,
  type CampusEvent, type CampusHome, type CampusMember, type CampusProfileInput,
  type EngineReport, type MatchType, type MatchView,
} from '../../src/lib/campus-model';
import type { CampusAI } from './backboard';

const documentRow = z.object({ document: z.string() });
const countRow = z.object({ total: z.number() });
const proposalRow = z.object({
  id: z.string(), a: z.string(), b: z.string(), kind: z.enum(['cofounder', 'sport', 'lunch']),
  reasons: z.string(), expires: z.number(), revoked: z.number().nullable(),
});
const answerRow = z.object({ user_id: z.string(), answer: z.enum(['yes', 'no']) });
const jobRow = z.object({ status: z.string(), attempts: z.number(), lease_until: z.number() });
const leaseRow = z.object({ owner: z.string().nullable(), lease_until: z.number(), last_run: z.number().nullable(), error: z.number() });
const vocabulary = { interests: interestId.options, skills: skillId.options, goals: goalId.options, sports: sportId.options };
const dayFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' });
const dayKey = (now: number) => dayFormatter.format(new Date(now));
const eligible = campusMemberEligible;
const overlaps = <T>(a: T[], b: T[]) => a.some(value => b.includes(value));

export class CampusError extends Error {
  constructor(readonly statusCode: number, message: string) { super(message); }
}

type Options = { notify?: (proposalId: string, recipients: readonly string[], kind: 'suggestion' | 'match') => void; ai: CampusAI | null; auth: { emailEnabled: boolean; domains: string[]; sharedDemo?: boolean }; now?: () => number };
type Pair = { a: CampusMember; b: CampusMember; kind: MatchType; key: string; demoGeneration: number };

/** Owns campus documents, consent projection and durable matching lifecycle. */
export class CampusService {
  private readonly now: () => number;

  constructor(private readonly db: DatabaseSync, private readonly options: Options) {
    this.now = options.now ?? Date.now;
    db.exec(`
      CREATE TABLE IF NOT EXISTS campus_members (
        user_id TEXT PRIMARY KEY REFERENCES auth_users(id) ON DELETE CASCADE,
        document TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS campus_locations (user_id TEXT PRIMARY KEY REFERENCES campus_members(user_id) ON DELETE CASCADE, document TEXT NOT NULL, updated INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS campus_jobs (
        pair_key TEXT PRIMARY KEY, a TEXT NOT NULL REFERENCES campus_members(user_id) ON DELETE CASCADE,
        b TEXT NOT NULL REFERENCES campus_members(user_id) ON DELETE CASCADE,
        status TEXT NOT NULL, attempts INTEGER NOT NULL, lease_until INTEGER NOT NULL, owner TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS campus_proposals (
        id TEXT PRIMARY KEY, pair_key TEXT NOT NULL UNIQUE,
        a TEXT NOT NULL REFERENCES campus_members(user_id) ON DELETE CASCADE,
        b TEXT NOT NULL REFERENCES campus_members(user_id) ON DELETE CASCADE,
        kind TEXT NOT NULL, reasons TEXT NOT NULL, expires INTEGER NOT NULL, revoked INTEGER,
        CHECK(a<b)
      );
      CREATE INDEX IF NOT EXISTS campus_proposals_a ON campus_proposals(a,expires);
      CREATE INDEX IF NOT EXISTS campus_proposals_b ON campus_proposals(b,expires);
      CREATE TABLE IF NOT EXISTS campus_answers (
        proposal_id TEXT NOT NULL REFERENCES campus_proposals(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES campus_members(user_id) ON DELETE CASCADE,
        answer TEXT NOT NULL CHECK(answer IN('yes','no')), PRIMARY KEY(proposal_id,user_id)
      );
      CREATE TABLE IF NOT EXISTS campus_match_feedback (
        proposal_id TEXT NOT NULL REFERENCES campus_proposals(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES campus_members(user_id) ON DELETE CASCADE,
        rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5), outcome TEXT NOT NULL CHECK(outcome IN ('met','planned','did-not-meet')),
        comment TEXT NOT NULL CHECK(length(comment)<=1000), created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        PRIMARY KEY(proposal_id,user_id)
      );
      CREATE TABLE IF NOT EXISTS campus_deliveries (
        user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
        proposal_id TEXT NOT NULL, campus_day TEXT NOT NULL, PRIMARY KEY(user_id,proposal_id)
      );
      CREATE INDEX IF NOT EXISTS campus_deliveries_day ON campus_deliveries(user_id,campus_day);
      CREATE TABLE IF NOT EXISTS campus_inference_days (campus_day TEXT PRIMARY KEY,total INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS campus_engine_lease (
        id INTEGER PRIMARY KEY CHECK(id=1), owner TEXT, lease_until INTEGER NOT NULL,
        last_run INTEGER, error INTEGER NOT NULL DEFAULT 0
      );
      INSERT OR IGNORE INTO campus_engine_lease(id,lease_until) VALUES(1,0);
      CREATE TABLE IF NOT EXISTS campus_demo_state (id INTEGER PRIMARY KEY CHECK(id=1),generation INTEGER NOT NULL);
      INSERT OR IGNORE INTO campus_demo_state(id,generation) VALUES(1,0);
      CREATE TABLE IF NOT EXISTS campus_events (id TEXT PRIMARY KEY,document TEXT NOT NULL);
    `);
  }

  private transaction<T>(action: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = action(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }

  /** Only the single deployed process calls this before it starts accepting traffic. */
  recoverInterruptedRun():void {
    this.transaction(()=>{
      this.db.prepare('UPDATE campus_engine_lease SET owner=NULL,lease_until=0 WHERE id=1').run();
      this.db.prepare("UPDATE campus_jobs SET status='failed',lease_until=0 WHERE status='running'").run();
    });
  }

  member(id: string): CampusMember | null {
    const row = this.db.prepare('SELECT document FROM campus_members WHERE user_id=?').get(id);
    return row ? campusMemberSchema.parse(JSON.parse(documentRow.parse(row).document)) : null;
  }

  private requireMember(id: string): CampusMember {
    const member = this.member(id);
    if (!member) throw new CampusError(403, 'Campus membership required');
    return member;
  }

  private writeMember(member: CampusMember) {
    this.db.prepare('INSERT INTO campus_members(user_id,document) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET document=excluded.document')
      .run(member.id, JSON.stringify(campusMemberSchema.parse(member)));
  }

  ensureMember(input: Pick<CampusMember, 'id' | 'email' | 'role' | 'verification'> & { name: string }): CampusMember {
    return this.transaction(() => {
      const current = this.member(input.id);
      if (current) {
        if (current.verification === 'unverified' && input.verification !== 'unverified') {
          const updated = { ...current, email: input.email, verification: input.verification, revision: current.revision + 1 };
          this.writeMember(updated);
          return updated;
        }
        return current;
      }
      const member: CampusMember = { id: input.id, email: input.email, role: input.role, verification: input.verification,
        complete: false, revision: 1, profile: initialCampusProfile(input.name) };
      this.writeMember(member);
      return member;
    });
  }

  saveProfile(id: string, input: CampusProfileInput): CampusHome {
    const profile = campusProfileSchema.parse(input);
    this.transaction(() => {
      const member = this.requireMember(id);
      this.writeMember({ ...member, profile, complete: true, revision: member.revision + 1 });
      if (!profile.consent.matching || !profile.consent.hostedAi) {
        this.db.prepare('DELETE FROM campus_locations WHERE user_id=?').run(id);
        this.db.prepare('UPDATE campus_proposals SET revoked=? WHERE (a=? OR b=?) AND revoked IS NULL')
          .run(this.now(), id, id);
      }
    });
    return this.home(id);
  }

  private projectProposal(row: z.infer<typeof proposalRow>, actor: CampusMember): MatchView | null {
    if (actor.verification === 'demo' && this.options.auth.sharedDemo !== true) return null;
    if (row.revoked !== null || !eligible(actor)) return null;
    const partner = this.member(row.a === actor.id ? row.b : row.a);
    if (!partner || !eligible(partner) || (partner.verification === 'demo') !== (actor.verification === 'demo')) return null;
    const answers = this.db.prepare('SELECT user_id,answer FROM campus_answers WHERE proposal_id=?').all(row.id).map(value => answerRow.parse(value));
    if (answers.some(answer => answer.answer === 'no')) return null;
    const fields = { id: row.id, matchType: row.kind, avatar: { colour: partner.profile.colour, interests: partner.profile.interests },
      reasons: judgementSchema.shape.reasonCodes.parse(JSON.parse(row.reasons)), expiresAt: new Date(row.expires).toISOString() };
    if (answers.length === 2 && answers.every(answer => answer.answer === 'yes')) {
      return { ...fields, kind: 'revealed', feedback:this.ownFeedback(actor.id,row.id), person: { name: partner.profile.name, course: partner.profile.course, year: partner.profile.year, email: partner.email } };
    }
    if (row.expires <= this.now()) return null;
    return { ...fields, kind: 'anonymous', myAnswer: answers.some(answer => answer.user_id === actor.id) ? 'yes' : 'pending' };
  }

  home(id: string | null): CampusHome {
    const me = id ? this.member(id) : null;
    const suggestions: MatchView[] = [];
    if (me && eligible(me)) {
      const rows = this.db.prepare('SELECT * FROM campus_proposals WHERE (a=? OR b=?) AND revoked IS NULL ORDER BY expires DESC LIMIT 100')
        .all(me.id, me.id);
      for (const row of rows) {
        const view = this.projectProposal(proposalRow.parse(row), me);
        if (view) suggestions.push(view);
      }
    }
    const lease = leaseRow.parse(this.db.prepare('SELECT owner,lease_until,last_run,error FROM campus_engine_lease WHERE id=1').get());
    const demo = me?.verification === 'demo';
    if(demo && this.options.auth.sharedDemo)refreshDemoEvents(this.db,this.now());
    const events = me?.complete && me.profile.consent.events && (!demo || this.options.auth.sharedDemo === true)
      ? this.db.prepare('SELECT document FROM campus_events').all().map(row => campusEventSchema.parse(JSON.parse(documentRow.parse(row).document)))
        .filter(event => (event.source === 'demo') === demo && Date.parse(event.date) > this.now() && overlaps(event.topics, me.profile.interests)).sort((a,b)=>Date.parse(a.date)-Date.parse(b.date)).slice(0, 20) : [];
    const alerts = demo && this.options.auth.sharedDemo === true && me && ['staff', 'admin'].includes(me.role)
      ? [{ id: 'fictional-guest', title: 'Fictional demo · campus guest', body: 'A fictional sustainability founder is visiting. Two demo teams share that interest. This alert contains no real campus data.', status: 'open' }] : [];
    return campusHomeSchema.parse({ me, suggestions, events, alerts, demo, auth: this.options.auth,
      agent: { configured: !!this.options.ai, model: this.options.ai?.model ?? 'Gemma 4 · Backboard',
        status: !this.options.ai ? 'not-configured' : lease.owner && lease.lease_until > this.now() ? 'running' : lease.error ? 'error' : 'ready',
        lastRun: lease.last_run === null ? null : new Date(lease.last_run).toISOString() } });
  }

  map(id:string):CampusMapState {
    this.requireMember(id);
    this.db.prepare('DELETE FROM campus_locations WHERE updated<=?').run(this.now()-120_000);
    const read=(userId:string)=>{ const row=this.db.prepare('SELECT document FROM campus_locations WHERE user_id=?').get(userId); return row?sharedLocationSchema.parse(JSON.parse(documentRow.parse(row).document)):null; };
    const people:CampusMapState['people']=[];
    for(const match of this.home(id).suggestions){
      if(match.kind!=='revealed')continue;
      const row=proposalRow.parse(this.db.prepare('SELECT * FROM campus_proposals WHERE id=?').get(match.id));
      const location=read(row.a===id?row.b:row.a);
      if(location)people.push({matchId:match.id,name:match.person.name,avatar:match.avatar,location});
    }
    return {own:read(id),people};
  }

  shareLocation(id:string,fix:LocationFix|null):CampusMapState {
    const member=this.requireMember(id);
    if(fix===null){this.db.prepare('DELETE FROM campus_locations WHERE user_id=?').run(id);return this.map(id);}
    const value=locationFixSchema.parse(fix);
    if(!eligible(member))throw new CampusError(403,'Complete your profile and enable matching first');
    if(value.simulated&&member.verification!=='demo')throw new CampusError(403,'Simulated locations are only available to fictional demo accounts');
    this.db.prepare('INSERT INTO campus_locations(user_id,document,updated) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET document=excluded.document,updated=excluded.updated').run(id,JSON.stringify({...value,updatedAt:this.now()}),this.now());
    return this.map(id);
  }

  answer(id: string, proposalId: string, answer: 'yes' | 'no'): CampusHome {
    this.transaction(() => {
      const member = this.requireMember(id);
      const raw = this.db.prepare('SELECT * FROM campus_proposals WHERE id=? AND (a=? OR b=?)').get(proposalId, id, id);
      if (!raw) throw new CampusError(404, 'Suggestion unavailable');
      const proposal = proposalRow.parse(raw);
      const previous = this.db.prepare('SELECT user_id,answer FROM campus_answers WHERE proposal_id=? AND user_id=?').get(proposalId, id);
      if (previous) {
        if (answerRow.parse(previous).answer !== answer) throw new CampusError(409, 'Answer already recorded');
        return;
      }
      if (!this.projectProposal(proposal, member)) throw new CampusError(409, 'Suggestion unavailable');
      this.db.prepare('INSERT INTO campus_answers(proposal_id,user_id,answer) VALUES(?,?,?)').run(proposalId, id, answer);
      if (this.projectProposal(proposal, member)?.kind === 'revealed') this.options.notify?.(proposalId, [proposal.a, proposal.b], 'match');
    });
    return this.home(id);
  }

  private ownFeedback(userId:string,proposalId:string) {
    const row=this.db.prepare('SELECT rating,outcome,comment,created_at AS createdAt,updated_at AS updatedAt FROM campus_match_feedback WHERE proposal_id=? AND user_id=?').get(proposalId,userId);
    return row?matchFeedbackSchema.parse(row):null;
  }

  feedback(userId:string,proposalId:string,input:FeedbackInput):CampusHome {
    const data=feedbackInputSchema.parse(input);
    this.transaction(()=>{
      const member=this.requireMember(userId);
      const raw=this.db.prepare('SELECT * FROM campus_proposals WHERE id=? AND (a=? OR b=?)').get(proposalId,userId,userId);
      if(!raw)throw new CampusError(404,'Match unavailable');
      // Feedback follows the current connection: revoked/declined/consent-withdrawn matches cannot be edited.
      if(this.projectProposal(proposalRow.parse(raw),member)?.kind!=='revealed')throw new CampusError(409,'Feedback is available after both people accept the match');
      const timestamp=new Date(this.now()).toISOString();
      this.db.prepare(`INSERT INTO campus_match_feedback(proposal_id,user_id,rating,outcome,comment,created_at,updated_at) VALUES(?,?,?,?,?,?,?)
        ON CONFLICT(proposal_id,user_id) DO UPDATE SET rating=excluded.rating,outcome=excluded.outcome,comment=excluded.comment,updated_at=excluded.updated_at`)
        .run(proposalId,userId,data.rating,data.outcome,data.comment,timestamp,timestamp);
    });
    return this.home(userId);
  }

  private compatible(a: CampusMember, b: CampusMember): MatchType | null {
    if ((a.verification === 'demo') !== (b.verification === 'demo')) return null;
    const pa = a.profile, pb = b.profile;
    const has = (profile: CampusProfileInput, goal: z.infer<typeof goalId>) => profile.lookingFor.includes(goal);
    const shared = overlaps(pa.interests, pb.interests);
    if ((has(pa, 'cofounder') && has(pb, 'join-project')) || (has(pb, 'cofounder') && has(pa, 'join-project'))
      || (shared && has(pa, 'cofounder') && has(pb, 'cofounder'))) return 'cofounder';
    if (has(pa, 'sport') && has(pb, 'sport') && pa.sports.some(sa => pb.sports.some(sb => sa.sport === sb.sport
      && sa.level === sb.level && overlaps(sa.days, sb.days) && overlaps(sa.slots, sb.slots)))) return 'sport';
    if (has(pa, 'lunch') && has(pb, 'lunch') && shared) return 'lunch';
    return null;
  }

  private deliveries(id: string): number {
    return countRow.parse(this.db.prepare('SELECT COUNT(*) AS total FROM campus_deliveries WHERE user_id=? AND campus_day=?').get(id, dayKey(this.now()))).total;
  }

  private supportedReasons(pair: Pair, judgement: z.infer<typeof judgementSchema>): z.infer<typeof judgementSchema>['reasonCodes'] {
    const a = pair.a.profile, b = pair.b.profile;
    return [...new Set(judgement.reasonCodes)].filter(reason => {
      switch (reason) {
        case 'shared_interests': return overlaps(a.interests, b.interests);
        case 'shared_goal': return overlaps(a.lookingFor, b.lookingFor) || pair.kind === 'cofounder';
        case 'complementary_skills': return a.skills.length > 0 && b.skills.length > 0
          && a.skills.some(skill => !b.skills.includes(skill)) && b.skills.some(skill => !a.skills.includes(skill));
        case 'same_sport': return a.sports.some(sa => b.sports.some(sb => sa.sport === sb.sport));
        case 'shared_availability': return a.sports.some(sa => b.sports.some(sb => sa.sport === sb.sport
          && overlaps(sa.days, sb.days) && overlaps(sa.slots, sb.slots)));
      }
    });
  }

  private claim(pair: Pair, owner: string): boolean {
    return this.transaction(() => {
      const demo = pair.a.verification === 'demo';
      if (demo && this.demoGeneration() !== pair.demoGeneration) return false;
      const lease = leaseRow.parse(this.db.prepare('SELECT owner,lease_until,last_run,error FROM campus_engine_lease WHERE id=1').get());
      if (lease.owner !== owner || lease.lease_until <= this.now()) return false;
      this.db.prepare('UPDATE campus_engine_lease SET lease_until=? WHERE id=1 AND owner=?').run(this.now() + 10 * 60_000, owner);
      if (this.deliveries(pair.a.id) >= 3 || this.deliveries(pair.b.id) >= 3) return false;
      const raw = this.db.prepare('SELECT status,attempts,lease_until FROM campus_jobs WHERE pair_key=?').get(pair.key);
      if (raw) {
        const job = jobRow.parse(raw);
        if (['published', 'rejected'].includes(job.status) || job.attempts >= 3 || job.lease_until > this.now()) return false;
      }
      const budgetKey = dayKey(this.now()) + (demo ? ':demo' : '');
      const used = this.db.prepare('SELECT total FROM campus_inference_days WHERE campus_day=?').get(budgetKey);
      if (used && countRow.parse(used).total >= (demo ? 100 : 30)) return false;
      this.db.prepare('INSERT INTO campus_inference_days(campus_day,total) VALUES(?,1) ON CONFLICT(campus_day) DO UPDATE SET total=total+1').run(budgetKey);
      this.db.prepare(`INSERT INTO campus_jobs(pair_key,a,b,status,attempts,lease_until,owner) VALUES(?,?,?,'running',1,?,?)
        ON CONFLICT(pair_key) DO UPDATE SET status='running',attempts=attempts+1,lease_until=excluded.lease_until,owner=excluded.owner`)
        .run(pair.key, pair.a.id, pair.b.id, this.now() + 10 * 60_000, owner);
      return true;
    });
  }

  private publish(pair: Pair, judgement: z.infer<typeof judgementSchema>, owner: string): boolean {
    return this.transaction(() => {
      const lease = leaseRow.parse(this.db.prepare('SELECT owner,lease_until,last_run,error FROM campus_engine_lease WHERE id=1').get());
      if (lease.owner !== owner || lease.lease_until <= this.now()) return false;
      if (pair.a.verification === 'demo' && this.demoGeneration() !== pair.demoGeneration) return false;
      const job = this.db.prepare("SELECT 1 FROM campus_jobs WHERE pair_key=? AND owner=? AND status='running'").get(pair.key, owner);
      if (!job) return false;
      const a = this.member(pair.a.id), b = this.member(pair.b.id);
      const valid = a && b && eligible(a) && eligible(b) && a.revision === pair.a.revision && b.revision === pair.b.revision;
      if (!valid) {
        this.db.prepare("UPDATE campus_jobs SET status='stale',lease_until=0 WHERE pair_key=?").run(pair.key);
        return false;
      }
      const reasons = this.supportedReasons(pair, judgement);
      if (judgement.score < 70 || reasons.length === 0) {
        this.db.prepare("UPDATE campus_jobs SET status='rejected',lease_until=0 WHERE pair_key=?").run(pair.key);
        return false;
      }
      if (this.deliveries(a.id) >= 3 || this.deliveries(b.id) >= 3) {
        this.db.prepare("UPDATE campus_jobs SET status='deferred',lease_until=? WHERE pair_key=?").run(this.now() + 60_000, pair.key);
        return false;
      }
      const existing = this.db.prepare('SELECT id FROM campus_proposals WHERE pair_key=?').get(pair.key);
      if (existing) return false;
      const id = randomUUID();
      this.db.prepare('INSERT INTO campus_proposals(id,pair_key,a,b,kind,reasons,expires) VALUES(?,?,?,?,?,?,?)')
        .run(id, pair.key, a.id, b.id, pair.kind, JSON.stringify(reasons), this.now() + 72 * 60 * 60_000);
      const insert = this.db.prepare('INSERT INTO campus_deliveries(user_id,proposal_id,campus_day) VALUES(?,?,?)');
      insert.run(a.id, id, dayKey(this.now())); insert.run(b.id, id, dayKey(this.now()));
      this.options.notify?.(id, [a.id, b.id], 'suggestion');
      this.db.prepare("UPDATE campus_jobs SET status='published',lease_until=0 WHERE pair_key=?").run(pair.key);
      return true;
    });
  }

  async runEngine(scope?: 'demo' | 'live'): Promise<EngineReport> {
    const ai = this.options.ai;
    if (!ai) return { scanned: 0, scored: 0, published: 0, status: 'unavailable' };
    const owner = randomUUID();
    const claimed = this.transaction(() => this.db.prepare('UPDATE campus_engine_lease SET owner=?,lease_until=? WHERE id=1 AND (owner IS NULL OR lease_until<=?)')
      .run(owner, this.now() + 10 * 60_000, this.now()).changes === 1);
    if (!claimed) return { scanned: 0, scored: 0, published: 0, status: 'busy' };
    let scanned = 0, scored = 0, published = 0, failed = false;
    try {
      const demoGeneration = this.demoGeneration();
      const members = this.db.prepare('SELECT document FROM campus_members ORDER BY user_id LIMIT 200').all()
        .map(row => campusMemberSchema.parse(JSON.parse(documentRow.parse(row).document)))
        .filter(member => eligible(member) && (member.verification !== 'demo' || this.options.auth.sharedDemo === true)
          && (!scope || (member.verification === 'demo') === (scope === 'demo')));
      outer: for (let i = 0; i < members.length; i++) {
        const a = members[i];
        if (!a) continue;
        for (let j = i + 1; j < members.length; j++) {
          const b = members[j];
          if (!b) continue;
          const kind = this.compatible(a, b);
          if (!kind) continue;
          scanned++;
          const pair = { a, b, kind, key: JSON.stringify([a.id, b.id, kind]), demoGeneration };
          if (!this.claim(pair, owner)) continue;
          scored++;
          try {
            const result = judgementSchema.parse(await ai.score(anonymousPair(kind, a.profile, b.profile, vocabulary)));
            if (this.publish(pair, result, owner)) published++;
          } catch {
            failed = true;
            this.db.prepare("UPDATE campus_jobs SET status='failed',lease_until=? WHERE pair_key=? AND status='running' AND owner=?")
              .run(this.now() + 60_000, pair.key, owner);
          }
          if (scored >= 12) break outer;
        }
      }
      return { scanned, scored, published, status: 'completed' };
    } finally {
      this.db.prepare('UPDATE campus_engine_lease SET owner=NULL,lease_until=0,last_run=?,error=? WHERE id=1 AND owner=?')
        .run(this.now(), failed ? 1 : 0, owner);
    }
  }

  addEvent(id: string, event: CampusEvent): CampusHome {
    const member = this.requireMember(id);
    if (!['staff', 'admin'].includes(member.role) || member.verification === 'unverified') throw new CampusError(403, 'Staff access required');
    const parsed = campusEventSchema.parse(member.verification === 'demo' ? { ...event, source: 'demo' } : event);
    if (member.verification !== 'demo' && parsed.source === 'demo') throw new CampusError(400, 'Use a fictional demo staff account for demo events');
    const existing = this.db.prepare('SELECT document FROM campus_events WHERE id=?').get(parsed.id);
    if (existing && (campusEventSchema.parse(JSON.parse(documentRow.parse(existing).document)).source === 'demo') !== (parsed.source === 'demo')) {
      throw new CampusError(409, 'Event belongs to another campus workspace');
    }
    this.db.prepare('INSERT INTO campus_events(id,document) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET document=excluded.document')
      .run(parsed.id, JSON.stringify(parsed));
    return this.home(id);
  }

  exportSelf(id: string): unknown {
    const home = this.home(id);
    if (!home.me) throw new CampusError(403, 'Campus membership required');
    return { profile: home.me, suggestions: home.suggestions };
  }

  deleteSelf(id: string): void { this.db.prepare('DELETE FROM campus_members WHERE user_id=?').run(id); }

  private demoGeneration(): number {
    return z.object({ generation: z.number() }).parse(this.db.prepare('SELECT generation FROM campus_demo_state WHERE id=1').get()).generation;
  }

  resetDemo(actorId: string): CampusHome {
    const actor = this.requireMember(actorId);
    if (actor.role !== 'admin' || actor.verification !== 'operator') throw new CampusError(403, 'Deployment operator access required');
    this.transaction(() => {
      const demoIds = this.db.prepare('SELECT document FROM campus_members').all()
        .map(row => campusMemberSchema.parse(JSON.parse(documentRow.parse(row).document)))
        .filter(member => member.verification === 'demo').map(member => member.id);
      this.db.prepare('UPDATE campus_demo_state SET generation=generation+1 WHERE id=1').run();
      for (const id of demoIds) {
        this.db.prepare('DELETE FROM campus_proposals WHERE a=? OR b=?').run(id, id);
        this.db.prepare('DELETE FROM campus_jobs WHERE a=? OR b=?').run(id, id);
        this.db.prepare('DELETE FROM campus_deliveries WHERE user_id=?').run(id);
        this.db.prepare('DELETE FROM campus_locations WHERE user_id=?').run(id);
      }
    });
    return this.home(actorId);
  }
}
