import { adminOverviewSchema,adminListSchema,type AdminScope,type AdminSection,type AdminQuery } from './campus-admin-model';
import { pushStatusSchema, type DeviceSubscription } from './push-model';
import { z } from 'zod';
import { type FeedbackInput, campusMapSchema, type LocationFix, type CampusMapState, campusHomeSchema, campusProfileSchema, campusSessionSchema, engineReportSchema, interestId, type CampusHome, type CampusProfileInput, type EngineReport } from './campus-model';
import { sharedDemoAccounts } from './campus-demo-accounts';

export type DemoAccount = { id: string; name: string };
export interface CampusClient {
  readonly mode: 'live' | 'demo';
  home(): Promise<CampusHome>;
  map():Promise<CampusMapState>;
  shareLocation(fix:LocationFix|null):Promise<CampusMapState>;
  saveProfile(profile: CampusProfileInput): Promise<CampusHome>;
  answer(id: string, answer: 'yes' | 'no'): Promise<CampusHome>;
  feedback(id:string,input:FeedbackInput):Promise<CampusHome>;
  requestCode(email: string): Promise<{ challengeId: string; expiresAt: string }>;
  verifyCode(challengeId: string, code: string): Promise<void>;
  signIn(email: string, password: string): Promise<void>;
  signInSharedDemo(code: string, alias: string): Promise<void>;
  signOut(): Promise<void>;
  normaliseInterest(text: string): Promise<{ categoryId: z.infer<typeof interestId> | null }>;
  runEngine(): Promise<EngineReport>;
  uploadPoster(image: string): Promise<CampusHome>;
  exportProfile(): Promise<unknown>;
  deleteProfile(): Promise<void>;
  demoAccounts(): DemoAccount[];
  switchDemo(id: string): Promise<CampusHome>;
  resetSharedDemo(): Promise<CampusHome>;
}

const tokenKey = 'hcommunity-api-session';
const apiUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') || '';
const codeReceiptSchema = z.object({ challengeId: z.string(), expiresAt: z.string() });
const categoryResultSchema = z.object({ categoryId: interestId.nullable() });

export class LiveCampusClient implements CampusClient {
  readonly mode = 'live';
  private sharedDemo = false;
  private async request(path: string, body?: unknown): Promise<unknown> {
    if (!apiUrl) throw new Error('The campus API has not been configured. You can still explore the fictional demo.');
    const token = sessionStorage.getItem(tokenKey);
    const response = await fetch(`${apiUrl}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store',
    });
    if (response.status === 204) return null;
    const result: unknown = await response.json();
    if (!response.ok) {
      if (response.status === 401) sessionStorage.removeItem(tokenKey);
      const error = z.object({ error: z.string() }).safeParse(result);
      throw new Error(error.success ? error.data.error : `Request failed (${response.status})`);
    }
    return result;
  }
  async adminOverview(scope:AdminScope) { return adminOverviewSchema.parse(await this.request(`/api/campus/admin/overview?scope=${scope}`)); }
  async adminList(section:AdminSection,query:AdminQuery) { const params=new URLSearchParams(Object.entries(query).map(([key,value])=>[key,String(value)]));return adminListSchema.parse(await this.request(`/api/campus/admin/${section}?${params}`)); }
  async pushStatus(endpoint: string | null) { return pushStatusSchema.parse(await this.request('/api/campus/push/status', {endpoint})); }
  async enablePush(subscription: DeviceSubscription, locale: 'en' | 'it') { return pushStatusSchema.parse(await this.request('/api/campus/push/subscribe', {subscription,locale})); }
  async disablePush(endpoint: string) { return pushStatusSchema.parse(await this.request('/api/campus/push/unsubscribe', {endpoint})); }
  async testPush(endpoint: string) { await this.request('/api/campus/push/test', {endpoint}); }
  async map(){return campusMapSchema.parse(await this.request("/api/campus/map"));}
  async shareLocation(fix:LocationFix|null){return campusMapSchema.parse(await this.request("/api/campus/map/location",fix));}
  async home() { const home = campusHomeSchema.parse(await this.request('/api/campus')); this.sharedDemo = home.demo; return home; }
  async saveProfile(profile: CampusProfileInput) { return campusHomeSchema.parse(await this.request('/api/campus/profile', campusProfileSchema.parse(profile))); }
  async answer(id: string, answer: 'yes' | 'no') { return campusHomeSchema.parse(await this.request(`/api/campus/matches/${encodeURIComponent(id)}/answer`, { answer })); }
  async feedback(id:string,input:FeedbackInput) { return campusHomeSchema.parse(await this.request(`/api/campus/matches/${encodeURIComponent(id)}/feedback`, input)); }
  async requestCode(email: string) { return codeReceiptSchema.parse(await this.request('/api/campus/auth/request-code', { email })); }
  async verifyCode(challengeId: string, code: string) {
    const session = campusSessionSchema.parse(await this.request('/api/campus/auth/verify', { challengeId, code }));
    sessionStorage.setItem(tokenKey, session.token);
  }
  async signIn(email: string, password: string) {
    const session = campusSessionSchema.parse(await this.request('/api/auth/login', { email, password }));
    sessionStorage.setItem(tokenKey, session.token);
  }
  async signInSharedDemo(code: string, alias: string) {
    const session = campusSessionSchema.parse(await this.request('/api/campus/demo/sign-in', { code, alias }));
    sessionStorage.setItem(tokenKey, session.token);
  }
  async signOut() {
    try { await this.request('/api/auth/logout', {}); } finally { sessionStorage.removeItem(tokenKey); this.sharedDemo = false; }
  }
  async normaliseInterest(text: string) { return categoryResultSchema.parse(await this.request('/api/campus/interests/normalise', { text, consent: true })); }
  async runEngine() { return engineReportSchema.parse(await this.request(this.sharedDemo ? '/api/campus/demo/run-engine' : '/api/campus/admin/run-engine', {})); }
  async uploadPoster(image: string) { return campusHomeSchema.parse(await this.request('/api/campus/events/from-image', { image, consent: true })); }
  async exportProfile() { return this.request('/api/campus/export'); }
  async deleteProfile() { await this.request('/api/campus/delete', { confirmation: 'DELETE' }); sessionStorage.removeItem(tokenKey); }
  demoAccounts(): DemoAccount[] { return sharedDemoAccounts.map(account => ({ id: account.id, name: account.name })); }
  async switchDemo(id: string): Promise<CampusHome> {
    const session = campusSessionSchema.parse(await this.request('/api/campus/demo/switch', { alias: id }));
    sessionStorage.setItem(tokenKey, session.token);
    return this.home();
  }
  async resetSharedDemo(): Promise<CampusHome> { return campusHomeSchema.parse(await this.request('/api/campus/admin/reset-demo', { confirmation: 'RESET DEMO' })); }
}
