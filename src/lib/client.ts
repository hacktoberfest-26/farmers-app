import { z } from 'zod';
import type { Database } from 'sql.js';
import { communityConfig, stateSchema, commandSchema, type Command, type CommunityState, type Profile } from './model';
import { applyCommand } from './policy';
import { createSeed } from './seed';
import { openSQLite,readState,writeState,exportDatabase } from './sqlite';

const apiUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/,'') || '';
export const liveMode = Boolean(apiUrl);
const STORAGE = `hcommunity-sqlite-${communityConfig.id}`;
const TOKEN_KEY = 'hcommunity-api-session';
const tokenSchema = z.object({ token:z.string().min(20),userId:z.string() });
export function emptyProfile(id: string, name = ''): Profile {
 return { id, name: name || 'New member', bio: '', area: communityConfig.location, avatar: '', color: '#55766b', sports: {}, favorites: [], availability: [], exceptions: [], goals: [], discoverable: true, role: 'pending', adult: true, onboarded: false, locale: 'en', timezone: communityConfig.timezone };
}
function browserStorage():Promise<IDBDatabase> {
 return new Promise((resolve,reject)=>{const request=indexedDB.open(STORAGE,1);request.onupgradeneeded=()=>{request.result.createObjectStore('database');};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(new Error('Unable to open local SQLite storage'));});
}
async function loadBytes():Promise<Uint8Array|undefined> {
 const storage=await browserStorage();
 return new Promise((resolve,reject)=>{const tx=storage.transaction('database','readonly');const request=tx.objectStore('database').get('sqlite');request.onsuccess=()=>{const bytes:unknown=request.result;resolve(bytes instanceof Uint8Array?bytes:undefined);};request.onerror=()=>reject(request.error);tx.oncomplete=()=>storage.close();});
}
async function saveBytes(bytes:Uint8Array):Promise<void> {
 const storage=await browserStorage();
 return new Promise((resolve,reject)=>{const tx=storage.transaction('database','readwrite');tx.objectStore('database').put(bytes,'sqlite');tx.oncomplete=()=>{storage.close();resolve();};tx.onerror=()=>{storage.close();reject(new Error('Unable to save SQLite database'));};});
}
export class CommunityClient {
 private db:Database|null=null;
 private loading:Promise<Database>|null=null;
 private channel:BroadcastChannel|null=null;
 private listeners=new Set<()=>void>();
 private async database():Promise<Database>{
  if(this.db)return this.db;
  if(this.loading)return this.loading;
  this.loading=(async()=>{const bytes=await loadBytes();const db=await openSQLite(bytes);if(!readState(db)){writeState(db,createSeed());await saveBytes(exportDatabase(db));}this.db=db;return db;})();
  try{return await this.loading;}finally{this.loading=null;}
 }
 private async request(path:string,body?:unknown):Promise<unknown>{
  const token=sessionStorage.getItem(TOKEN_KEY);
  const response=await fetch(`${apiUrl}${path}`,{method:body===undefined?'GET':'POST',headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...(token?{Authorization:`Bearer ${token}`}:{})},body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'});
  if(response.status===204)return null;
  const data:unknown=await response.json();
  if(!response.ok){if(response.status===401)sessionStorage.removeItem(TOKEN_KEY);const error=z.object({error:z.string()}).safeParse(data);throw new Error(error.success?error.data.error:`Request failed (${response.status})`);}
  return data;
 }
 async snapshot():Promise<CommunityState>{
  if(liveMode)return stateSchema.parse(await this.request('/api/community'));
  return readState(await this.database())||createSeed();
 }
 private async localMutation(mutate:(state:CommunityState)=>CommunityState):Promise<CommunityState>{
  const work=async()=>{const bytes=await loadBytes();const db=await openSQLite(bytes);try{const next=mutate(readState(db)||createSeed());writeState(db,next);await saveBytes(exportDatabase(db));this.db?.close();this.db=db;this.channel?.postMessage('updated');return next;}catch(error){db.close();throw error;}};
  if(navigator.locks)return navigator.locks.request(STORAGE,work);
  return work();
 }
 async execute(input:Command):Promise<CommunityState>{
  if(!navigator.onLine)throw new Error('offlineAction');
  const command=commandSchema.parse(input);
  if(liveMode){const result=stateSchema.parse(await this.request('/api/commands',command));if(command.type==='account.delete')sessionStorage.removeItem(TOKEN_KEY);return result;}
  return this.localMutation(state=>applyCommand(state,command));
 }
 async signIn(email:string,password:string){const result=tokenSchema.parse(await this.request('/api/auth/login',{email,password}));sessionStorage.setItem(TOKEN_KEY,result.token);}
 async signUp(email:string,password:string,name:string){const result=tokenSchema.parse(await this.request('/api/auth/register',{email,password,name,adult:true}));sessionStorage.setItem(TOKEN_KEY,result.token);return true;}
 async signOut(){if(liveMode){await this.request('/api/auth/logout',{});sessionStorage.removeItem(TOKEN_KEY);}else await this.localMutation(state=>({...state,viewerId:null}));}
 async createProfile(name:string,adult:boolean){if(liveMode)throw new Error('Use account registration');if(!adult)throw new Error('Adults only');const profile=emptyProfile(crypto.randomUUID(),name.trim());profile.role='member';return this.localMutation(state=>({...state,viewerId:profile.id,profiles:[...state.profiles,profile]}));}
 async switchProfile(id:string){if(liveMode)throw new Error('Demo profiles are unavailable on shared backend');return this.localMutation(state=>{if(!state.profiles.some(p=>p.id===id))throw new Error('Profile not found');return{...state,viewerId:id};});}
 async tryDemo(){return this.switchProfile('you');}
 async exportDatabase():Promise<Uint8Array>{if(liveMode)throw new Error('Database files are managed by the deployment operator');return exportDatabase(await this.database());}
 subscribe(callback:()=>void):()=>void{
  this.listeners.add(callback);
  if(liveMode){const timer=window.setInterval(callback,15000);const focus=()=>callback();window.addEventListener('focus',focus);return()=>{window.clearInterval(timer);window.removeEventListener('focus',focus);this.listeners.delete(callback);};}
  if(typeof BroadcastChannel!=='undefined'&&!this.channel){this.channel=new BroadcastChannel(STORAGE);this.channel.onmessage=()=>{this.db?.close();this.db=null;for(const listener of this.listeners)listener();};}
  return()=>{this.listeners.delete(callback);if(!this.listeners.size){this.channel?.close();this.channel=null;}};
 }
}
