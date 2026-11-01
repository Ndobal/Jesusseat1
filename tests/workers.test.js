import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../src/db.js';
import { createApp,POLICY_VERSION } from '../src/app.js';
import { id,secret,digest } from '../src/security.js';

const origin='http://127.0.0.1:3000';
async function fixture(t){
 const db=openDatabase(':memory:');t.after(()=>db.close());
 const app=createApp({db,origin,outboxKey:'worker-fixture-only-encryption-key'});
 const user=()=>{const uid=id(),token=secret(),csrf=secret();db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?)').run(uid,'Fixture worker',`${uid}@example.test`,'unused-fixture-hash',Date.now(),Date.now());db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(digest(token),uid,csrf,Date.now()+3600000);return {uid,cookie:`jesusseat=${token}`,csrf};};
 const request=(path,s,method='GET',body={})=>app({path,method,body,ip:'workers-test',headers:{origin,cookie:s.cookie,'x-csrf-token':s.csrf}});
 const owner=user(),worker=user(),r=await request('/api/churches',owner,'POST',{name:'Workers church',slug:'workers-church',country:'Nigeria',city:'Abuja',timezone:'Africa/Lagos',structure:'multi_branch',acceptPolicy:true,policyVersion:POLICY_VERSION});assert.equal(r.status,201);
 const cid=r.data.id,base=`/api/churches/${cid}`;
 const assign=(s,builtin)=>{const role=db.prepare('SELECT id FROM roles WHERE church_id=? AND builtin=?').get(cid,builtin);db.prepare('INSERT INTO memberships VALUES(?,?,?,?,?,?) ON CONFLICT(church_id,user_id) DO UPDATE SET role_id=excluded.role_id,branch_id=NULL').run(id(),cid,s.uid,role.id,null,Date.now());return role.id;};
 return {db,user,request,owner,worker,cid,base,assign};
}
test('ordinary members cannot read or mutate any worker workspace route',async t=>{
 const h=await fixture(t);h.assign(h.worker,'member');
 assert.equal((await h.request('/api/me',h.worker)).data.churches.length,0);
 for(const tail of ['','/roles','/team','/branches','/statements','/audit','/directory'])assert.equal((await h.request(h.base+tail,h.worker)).status,403,tail);
 for(const [tail,method,body] of [['','PATCH',{name:'Changed'}],['/branches','POST',{name:'Changed'}],['/statements','POST',{kind:'vision',title:'Changed',body:'Changed'}],['/directory','PATCH',{published:true}],['/invitations','POST',{}]])assert.equal((await h.request(h.base+tail,h.worker,method,body)).status,403);
 assert.equal(h.db.prepare('SELECT name FROM churches').get().name,'Workers church');
 assert.equal((await h.request('/api/auth/sessions',h.worker)).status,undefined);
});
test('worker demotion suspends access immediately and blocks direct reactivation',async t=>{
 const h=await fixture(t);h.assign(h.worker,'usher');assert.equal((await h.request(h.base,h.worker)).status,undefined);assert.equal((await h.request('/api/me',h.worker)).data.churches.length,1);
 const membership=h.db.prepare('SELECT id FROM memberships WHERE user_id=?').get(h.worker.uid).id,member=h.db.prepare("SELECT id FROM roles WHERE church_id=? AND builtin='member'").get(h.cid).id;
 assert.equal((await h.request(`${h.base}/team/${membership}`,h.owner,'PATCH',{role_id:member})).status,undefined);assert.equal((await h.request(h.base,h.worker)).status,403);assert.equal((await h.request('/api/me',h.worker)).data.churches.length,0);
 const head=h.db.prepare("SELECT id FROM roles WHERE church_id=? AND builtin='head_usher'").get(h.cid).id;
 assert.equal((await h.request(`${h.base}/team/${membership}`,h.owner,'PATCH',{role_id:head})).status,409);assert.equal((await h.request(h.base,h.worker)).status,403);assert.equal(h.db.prepare('SELECT count(*) n FROM memberships WHERE user_id=?').get(h.worker.uid).n,1);
});
test('one person can serve multiple churches and suspension affects only one dashboard',async t=>{
 const h=await fixture(t);h.assign(h.worker,'usher');
 const create=async slug=>{const r=await h.request('/api/churches',h.owner,'POST',{name:slug,slug,country:'Nigeria',city:'Abuja',timezone:'Africa/Lagos',structure:'independent',acceptPolicy:true,policyVersion:POLICY_VERSION});assert.equal(r.status,201);return r.data.id;};
 const b=await create('another-church'),c=await create('third-church');
 for(const [church,builtin] of [[b,'media'],[c,'member']]){const role=h.db.prepare('SELECT id FROM roles WHERE church_id=? AND builtin=?').get(church,builtin).id;h.db.prepare('INSERT INTO memberships VALUES(?,?,?,?,?,?)').run(id(),church,h.worker.uid,role,null,Date.now());}
 const initial=(await h.request('/api/me',h.worker)).data.churches;assert.deepEqual(new Set(initial.map(x=>x.id)),new Set([h.cid,b]));
 const member=h.db.prepare('SELECT id FROM memberships WHERE church_id=? AND user_id=?').get(h.cid,h.worker.uid).id;
 assert.equal((await h.request(`${h.base}/team/${member}`,h.owner,'DELETE')).status,undefined);
 assert.equal((await h.request(h.base,h.worker)).status,403);assert.equal((await h.request(`/api/churches/${b}`,h.worker)).status,undefined);assert.equal((await h.request(`/api/churches/${c}`,h.worker)).status,403);
 assert.deepEqual((await h.request('/api/me',h.worker)).data.churches.map(x=>x.id),[b]);assert.equal(h.db.prepare('SELECT count(*) n FROM memberships WHERE user_id=?').get(h.worker.uid).n,3);
 const saved=h.db.prepare('SELECT m.id,r.builtin FROM memberships m JOIN roles r ON r.id=m.role_id WHERE m.church_id=? AND m.user_id=?').get(h.cid,h.worker.uid);assert.equal(saved.id,member);assert.equal(saved.builtin,'member');
 const role=h.db.prepare("SELECT id FROM roles WHERE church_id=? AND builtin='usher'").get(h.cid).id;
 assert.equal((await h.request(h.base+'/invitations',h.owner,'POST',{email:`${h.worker.uid}@example.test`,role_id:role})).status,409);
 assert.equal((await h.request(`${h.base}/team/${member}`,h.owner,'PATCH',{role_id:role})).status,409);
 assert.equal((await h.request('/api/auth/sessions',h.worker)).status,undefined);
});
test('worker suspension and preserved membership roll back if audit cannot commit',async t=>{
 const h=await fixture(t);const role=h.assign(h.worker,'usher'),member=h.db.prepare('SELECT id FROM memberships WHERE church_id=? AND user_id=?').get(h.cid,h.worker.uid).id;
 h.db.exec("CREATE TRIGGER reject_worker_suspend BEFORE INSERT ON audit WHEN NEW.action='worker.access_suspended' BEGIN SELECT RAISE(ABORT,'test'); END;");
 assert.equal((await h.request(`${h.base}/team/${member}`,h.owner,'DELETE')).status,500);assert.equal(h.db.prepare('SELECT count(*) n FROM worker_access_suspensions').get().n,0);assert.equal(h.db.prepare('SELECT role_id FROM memberships WHERE id=?').get(member).role_id,role);assert.equal((await h.request(h.base,h.worker)).status,undefined);
});
test('operational worker roles do not gain unrelated administration or platform access',async t=>{
 const h=await fixture(t);
 for(const builtin of ['head_usher','usher','project_coordinator','department_leader']){
  h.assign(h.worker,builtin);const w=await h.request(h.base,h.worker);assert.equal(w.status,undefined);assert.ok(!w.data.permissions.includes('church.manage'));assert.ok(!w.data.permissions.includes('finance.manage'));assert.equal((await h.request(h.base+'/audit',h.worker)).status,403);assert.equal((await h.request('/api/platform/enquiries',h.worker)).status,403);
 }
});
test('permission-equivalent custom managers cannot appoint confidential leadership roles',async t=>{
 const h=await fixture(t),role=id(),permissions=['church.read','team.read','team.manage','attendance.manage','groups.manage','care.manage'];
 h.db.prepare('INSERT INTO roles(id,church_id,name,permissions) VALUES(?,?,?,?)').run(role,h.cid,'Team coordinator',JSON.stringify(permissions));h.db.prepare('INSERT INTO memberships VALUES(?,?,?,?,?,?)').run(id(),h.cid,h.worker.uid,role,null,Date.now());
 for(const builtin of ['pastor','head_usher']){const target=h.db.prepare('SELECT id FROM roles WHERE church_id=? AND builtin=?').get(h.cid,builtin).id;assert.equal((await h.request(h.base+'/invitations',h.worker,'POST',{email:'leadership@example.test',role_id:target})).status,403);}
 const recipient=h.user(),token=secret(),pastor=h.db.prepare("SELECT id FROM roles WHERE church_id=? AND builtin='pastor'").get(h.cid).id;
 h.db.prepare('INSERT INTO invitations(id,church_id,email,role_id,token_hash,invited_by,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?)').run(id(),h.cid,`${recipient.uid}@example.test`,pastor,digest(token),h.worker.uid,Date.now()+60000,Date.now());
 assert.equal((await h.request('/api/invitations/accept',recipient,'POST',{token})).status,403);
 assert.equal(h.db.prepare('SELECT count(*) n FROM memberships WHERE user_id=?').get(recipient.uid).n,0);
});
test('member invitations confirm membership without claiming worker dashboard access',async t=>{
 const h=await fixture(t),role=h.db.prepare("SELECT id FROM roles WHERE church_id=? AND builtin='member'").get(h.cid).id,token=secret();
 h.db.prepare('INSERT INTO invitations(id,church_id,email,role_id,token_hash,invited_by,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?)').run(id(),h.cid,`${h.worker.uid}@example.test`,role,digest(token),h.owner.uid,Date.now()+60000,Date.now());
 const r=await h.request('/api/invitations/accept',h.worker,'POST',{token});assert.equal(r.status,undefined);assert.equal(r.data.workspaceAccess,false);assert.equal((await h.request('/api/me',h.worker)).data.churches.length,0);
});
test('migration five seeds missing roles once, preserves collisions and records audit',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'jesusseat-workers-')),path=join(dir,'upgrade.sqlite');t.after(()=>rmSync(dir,{recursive:true,force:true}));
 let db=openDatabase(path);const uid=id(),cid=id(),custom=id();db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?)').run(uid,'Fixture','fixture@example.test','unused-fixture-hash',Date.now(),Date.now());
 db.prepare('INSERT INTO churches(id,name,slug,structure,country,city,timezone,policy_version,accepted_by,accepted_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(cid,'Legacy church','legacy-worker','independent','Nigeria','Abuja','Africa/Lagos',POLICY_VERSION,uid,Date.now(),Date.now());
 db.prepare('INSERT INTO roles(id,church_id,name,permissions) VALUES(?,?,?,?)').run(custom,cid,'Head usher','["church.read"]');
 const legacyMember=id();db.prepare('INSERT INTO roles(id,church_id,name,builtin,permissions) VALUES(?,?,?,?,?)').run(legacyMember,cid,'Member','member','["church.read"]');db.prepare('INSERT INTO memberships VALUES(?,?,?,?,?,?)').run(id(),cid,uid,legacyMember,null,Date.now());db.exec('DELETE FROM schema_migrations WHERE version=5');db.close();
 for(let i=0;i<2;i++){db=openDatabase(path);assert.equal(db.prepare('SELECT count(*) n FROM roles').get().n,6);assert.equal(db.prepare("SELECT name FROM roles WHERE builtin='head_usher'").get().name,'Head usher (standard 1)');assert.equal(db.prepare('SELECT name FROM roles WHERE id=?').get(custom).name,'Head usher');assert.equal(db.prepare("SELECT permissions FROM roles WHERE id=?").get(legacyMember).permissions,'[]');assert.equal(db.prepare('SELECT role_id FROM memberships WHERE user_id=?').get(uid).role_id,legacyMember);assert.equal(db.prepare("SELECT count(*) n FROM audit WHERE action='role.member_workspace_removed'").get().n,1);assert.equal(db.prepare("SELECT count(*) n FROM audit WHERE action='role.bootstrap'").get().n,4);assert.equal(db.prepare('SELECT max(version) n FROM schema_migrations').get().n,6);db.close();}
});
