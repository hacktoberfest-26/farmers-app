import { colours, initialCampusProfile } from '../../src/lib/campus-model';
import { sharedDemoAccounts } from '../../src/lib/campus-demo-accounts';
import { CampusError, type CampusService } from './campus-service';
import type { CommunityStore } from './store';

export function sharedDemoAccount(store:CommunityStore,campus:CampusService,alias:string) {
  const fixture=sharedDemoAccounts.find(person=>person.id===alias);
  if(!fixture)throw new CampusError(400,'Choose a fictional demo person');
  const account=store.userByEmail(`${fixture.id}@shared-demo.farmers.invalid`);
  if(!account||campus.member(account.id)?.verification!=='demo')throw new CampusError(503,'Shared demo is not ready');
  return account;
}

export function seedSharedDemo(store:CommunityStore,campus:CampusService) {
  sharedDemoAccounts.forEach((fixture,index)=>{
    const account=store.createOtpUser(`${fixture.id}@shared-demo.farmers.invalid`,`shared-demo-${String(index).padStart(2,'0')}-${fixture.id}`);
    if(campus.member(account.id))return;
    campus.ensureMember({id:account.id,email:account.email,name:fixture.name,role:index===11?'staff':'student',verification:'demo'});
    campus.saveProfile(account.id,{
      ...initialCampusProfile(fixture.name),course:index%2?'Digital Business · fictional':'Interaction Design · fictional',year:'2',
      interests:index<2?['technology','design','business']:index%3===0?['technology','sustainability','business']:index%3===1?['design','arts','community']:['sport','music','community'],
      skills:index%2?['design','business']:['engineering','research'],lookingFor:index===0?['cofounder']:index===1?['join-project']:index%2?['sport']:['lunch'],
      colour:colours[index%colours.length]??colours[0],consent:{matching:true,hostedAi:true,events:true,resources:true},
      sports:[{sport:index%2?'padel':'tennis',level:'beginner',days:[1,3],slots:['afternoon']}],
    });
  });
  store.db.exec(`CREATE TABLE IF NOT EXISTS campus_demo_seed(key TEXT PRIMARY KEY);`);
  if(!store.db.prepare("SELECT 1 FROM campus_demo_seed WHERE key='events-v1'").get()) {
    store.db.prepare('INSERT INTO campus_events(id,document) VALUES(?,?)').run('shared-demo-coffee',JSON.stringify({id:'shared-demo-coffee',title:'Ideas over coffee · fictional',date:new Date(Date.now()+2*86400000).toISOString(),place:'Campus café · fictional',topics:['business','community','design'],source:'demo'}));
    store.db.prepare("INSERT INTO campus_demo_seed(key) VALUES('events-v1')").run();
  }
}

