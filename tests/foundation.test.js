import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/db.js';
import { createApp, POLICY_VERSION } from '../src/app.js';
import { decrypt, digest, hashPassword, id } from '../src/security.js';
import { createHttpServer } from '../src/server.js';
import { deliverMail } from '../src/mail.js';
import { loadConfig } from '../src/config.js';
import { backup } from 'node:sqlite';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { encodeBase32, decodeBase32, hotp, totp, matchTotp } from '../src/totp.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const origin='http://127.0.0.1:3000',outboxKey='test-only-encryption-key-not-for-real-data';
let counter=0;
function harness(){
 const db=openDatabase(':memory:'),app=createApp({db,origin,outboxKey}),ip=`fixture-${counter++}`;
 const request=(path,method='GET',body={},session=null,headers={})=>app({path,method,body,ip,headers:{origin,...(session?{cookie:session.cookie,'x-csrf-token':session.csrf}:{}),...headers},query:new URL(path,origin).searchParams});
 const lastToken=(address,kind)=>{
   const rows=db.prepare('SELECT payload FROM outbox WHERE recipient=? ORDER BY rowid DESC').all(address);
   for(const row of rows){const message=decrypt(row.payload,outboxKey);const match=message.match(new RegExp(`/${kind}#token=([A-Za-z0-9_-]+)`));if(match)return match[1];}
   throw new Error('No token email found');
 };
 const register=async(address,verify=true,pass='A long test passphrase 123')=>{
   const r=await request('/api/auth/register','POST',{name:'Church worker',email:address,password:pass});assert.equal(r.status,202);
   if(verify){const v=await request('/api/auth/verify','POST',{token:lastToken(address,'verify')});assert.equal(v.status,undefined);}
   const login=await request('/api/auth/login','POST',{email:address,password:pass});assert.equal(login.status,undefined,JSON.stringify(login.data));
   return {cookie:login.cookie.split(';')[0],csrf:login.data.csrf,email:address};
 };
 const church=async(session,slug='church-one',structure='multi_branch')=>{
   const r=await request('/api/churches','POST',{name:'Test ministry',slug,country:'Nigeria',city:'Abuja',timezone:'Africa/Lagos',structure,acceptPolicy:true,policyVersion:POLICY_VERSION},session);
   assert.equal(r.status,201,JSON.stringify(r.data));return r.data.id;
 };
 return {db,app,request,lastToken,register,church};
}

test('signup stores a strong salted hash; email verification is one-use; login has HttpOnly cookies',async()=>{
 const h=harness();const s=await h.register('owner@example.test');
 const u=h.db.prepare('SELECT * FROM users').get();assert.match(u.password_hash,/^scrypt\$/);assert.ok(u.verified_at);
 assert.equal(h.db.prepare('SELECT count(*) n FROM tokens').get().n,0);
 const reused=await h.request('/api/auth/verify','POST',{token:h.lastToken(s.email,'verify')});assert.equal(reused.status,400);
 const me=await h.request('/api/me','GET',{},s);assert.equal(me.data.user.verified,true);assert.ok(me.data.csrf);
 assert.equal(h.db.prepare('SELECT token_hash FROM sessions').get().token_hash,digest(s.cookie.split('=')[1]));
 const login=await h.request('/api/auth/login','POST',{email:s.email,password:'A long test passphrase 123'});assert.match(login.cookie,/HttpOnly; SameSite=Lax/);
});
test('verification is required before church creation',async()=>{
 const h=harness(),s=await h.register('unverified@example.test',false);
 const r=await h.request('/api/churches','POST',{},s);assert.equal(r.status,403);assert.match(r.data.error,/Verify/);
});
test('duplicate signup does not reveal account existence or queue an extra email',async()=>{
 const h=harness();await h.register('duplicate@example.test');const n=h.db.prepare('SELECT count(*) n FROM outbox').get().n;
 const r=await h.request('/api/auth/register','POST',{name:'Someone else',email:'DUPLICATE@example.test',password:'A different long password'});
 assert.equal(r.status,202);assert.equal(h.db.prepare('SELECT count(*) n FROM users').get().n,1);assert.equal(h.db.prepare('SELECT count(*) n FROM outbox').get().n,n);
});
test('tenant isolation blocks reads, edits, roles, branches, team, statements and audit',async()=>{
 const h=harness(),a=await h.register('a@example.test'),b=await h.register('b@example.test');
 const ca=await h.church(a,'alpha-church');await h.church(b,'beta-church');
 for(const [tail,method,body] of [['','GET',{}],['','PATCH',{name:'Intruder'}],['/roles','GET',{}],['/branches','POST',{name:'Intruder'}],['/team','GET',{}],['/statements','GET',{}],['/statements','POST',{}],['/audit','GET',{}]]){
   const r=await h.request(`/api/churches/${ca}${tail}`,method,body,b);assert.equal(r.status,404,`${method} ${tail}`);
 }
});
test('origin and CSRF protections apply to authenticated writes',async()=>{
 const h=harness(),s=await h.register('csrf@example.test'),c=await h.church(s);
 const path=`/api/churches/${c}`;
 assert.equal((await h.request(path,'PATCH',{name:'Changed'},s,{origin:'https://attacker.test'})).status,403);
 assert.equal((await h.request(path,'PATCH',{name:'Changed'},s,{'x-csrf-token':'wrong'})).status,403);
 assert.equal(h.db.prepare('SELECT name FROM churches').get().name,'Test ministry');
});
test('registration records policy acceptance and rejects duplicate slugs and invalid policies',async()=>{
 const h=harness(),s=await h.register('policy@example.test'),c=await h.church(s);
 const row=h.db.prepare('SELECT * FROM churches WHERE id=?').get(c);assert.equal(row.policy_version,POLICY_VERSION);assert.ok(row.accepted_by);
 const data={name:'Another ministry',slug:'church-one',country:'Nigeria',city:'Abuja',timezone:'Africa/Lagos',structure:'independent',acceptPolicy:true,policyVersion:POLICY_VERSION};
 assert.equal((await h.request('/api/churches','POST',data,s)).status,409);
 assert.equal((await h.request('/api/churches','POST',{...data,slug:'different',acceptPolicy:false},s)).status,400);
 assert.equal((await h.request('/api/churches','POST',{...data,slug:'different',timezone:'Fake/Zone'},s)).status,400);
});
test('failed atomic church audit rolls back church, roles, membership and branch',async()=>{
 const h=harness(),s=await h.register('rollback@example.test');
 h.db.exec("CREATE TRIGGER fail_church_audit BEFORE INSERT ON audit WHEN NEW.action='church.create' BEGIN SELECT RAISE(ABORT,'forced failure'); END;");
 const r=await h.request('/api/churches','POST',{name:'Atomic church',slug:'atomic',country:'Nigeria',city:'Abuja',timezone:'Africa/Lagos',structure:'independent',acceptPolicy:true,policyVersion:POLICY_VERSION},s);
 assert.equal(r.status,500);for(const table of ['churches','roles','memberships','branches'])assert.equal(h.db.prepare(`SELECT count(*) n FROM ${table}`).get().n,0,table);
});
test('password recovery expires, is single-use and revokes all existing sessions',async()=>{
 const h=harness(),s=await h.register('reset@example.test');
 await h.request('/api/auth/forgot','POST',{email:s.email});const token=h.lastToken(s.email,'reset');
 const r=await h.request('/api/auth/reset','POST',{token,password:'A newly changed passphrase'});assert.equal(r.status,undefined);
 assert.equal((await h.request('/api/me','GET',{},s)).status,401);
 assert.equal((await h.request('/api/auth/reset','POST',{token,password:'Another long passphrase'})).status,400);
 assert.equal((await h.request('/api/auth/login','POST',{email:s.email,password:'A long test passphrase 123'})).status,401);
 assert.equal((await h.request('/api/auth/login','POST',{email:s.email,password:'A newly changed passphrase'})).status,undefined);
});
test('expired verification and reset tokens cannot be used',async()=>{
 const h=harness();await h.register('expiry@example.test',false);
 const token=h.lastToken('expiry@example.test','verify');h.db.prepare('UPDATE tokens SET expires_at=0').run();
 assert.equal((await h.request('/api/auth/verify','POST',{token})).status,400);
 await h.request('/api/auth/forgot','POST',{email:'expiry@example.test'});const reset=h.lastToken('expiry@example.test','reset');h.db.prepare('UPDATE tokens SET expires_at=0').run();
 assert.equal((await h.request('/api/auth/reset','POST',{token:reset,password:'A valid long password'})).status,400);
});
test('passwords preserve intentional leading and trailing spaces',async()=>{
 const h=harness(),s=await h.register('spaces@example.test',true,'  a long unique password  ');assert.ok(s.csrf);
});
async function inviteFixture(){
 const h=harness(),owner=await h.register('owner@example.test'),worker=await h.register('worker@example.test'),c=await h.church(owner);
 const roles=(await h.request(`/api/churches/${c}/roles`,'GET',{},owner)).data.roles;
 return {...h,owner,worker,c,roles};
}
test('invitation binds verified email, applies chosen role and can only be accepted once',async()=>{
 const h=await inviteFixture(),role=h.roles.find(r=>r.builtin==='media');
 const sent=await h.request(`/api/churches/${h.c}/invitations`,'POST',{email:h.worker.email,role_id:role.id},h.owner);assert.equal(sent.status,201);
 const token=h.lastToken(h.worker.email,'invite');assert.equal((await h.request('/api/invitations/accept','POST',{token},h.owner)).status,403);
 assert.equal((await h.request('/api/invitations/accept','POST',{token},h.worker)).status,undefined);
 assert.equal((await h.request('/api/invitations/accept','POST',{token},h.worker)).status,400);
 const w=await h.request(`/api/churches/${h.c}`,'GET',{},h.worker);assert.ok(w.data.permissions.includes('media.manage'));assert.ok(!w.data.permissions.includes('team.manage'));
 assert.equal((await h.request(`/api/churches/${h.c}/invitations`,'POST',{email:'third@example.test',role_id:role.id},h.worker)).status,403);
});
test('revoked and replaced invitations cannot be accepted',async()=>{
 const h=await inviteFixture(),role=h.roles.find(r=>r.builtin==='member');
 const send=()=>h.request(`/api/churches/${h.c}/invitations`,'POST',{email:h.worker.email,role_id:role.id},h.owner);
 await send();const old=h.lastToken(h.worker.email,'invite');await send();const current=h.lastToken(h.worker.email,'invite');
 assert.equal((await h.request('/api/invitations/accept','POST',{token:old},h.worker)).status,400);
 const inv=h.db.prepare('SELECT id FROM invitations WHERE token_hash=?').get(digest(current));
 assert.equal((await h.request(`/api/churches/${h.c}/invitations/${inv.id}`,'DELETE',{},h.owner)).status,undefined);
 assert.equal((await h.request('/api/invitations/accept','POST',{token:current},h.worker)).status,400);
});
test('foreign role and branch identifiers cannot be used in invitations',async()=>{
 const h=await inviteFixture(),other=await h.register('other@example.test'),otherChurch=await h.church(other,'other-church');
 const foreignRole=h.db.prepare('SELECT id FROM roles WHERE church_id=? LIMIT 1').get(otherChurch).id;
 const foreignBranch=h.db.prepare('SELECT id FROM branches WHERE church_id=? LIMIT 1').get(otherChurch).id;
 const path=`/api/churches/${h.c}/invitations`;
 assert.equal((await h.request(path,'POST',{email:h.worker.email,role_id:foreignRole},h.owner)).status,400);
 assert.equal((await h.request(path,'POST',{email:h.worker.email,role_id:h.roles[0].id,branch_id:foreignBranch},h.owner)).status,403);
});
test('branch manager can manage descendants but cannot reach siblings, church-wide settings or elevate privileges',async()=>{
 const h=await inviteFixture();const base=`/api/churches/${h.c}`;
 const branch=async(name,parent=null)=>(await h.request(`${base}/branches`,'POST',{name,label:'Branch',parent_id:parent},h.owner)).data.id;
 const a=await branch('Branch Alpha'),aChild=await branch('Alpha youth',a),b=await branch('Branch Beta');
 const role=(await h.request(`${base}/roles`,'POST',{name:'Branch leader',permissions:['church.read','team.read','team.manage','branches.manage','roles.manage']},h.owner)).data.id;
 await h.request(`${base}/invitations`,'POST',{email:h.worker.email,role_id:role,branch_id:a},h.owner);
 await h.request('/api/invitations/accept','POST',{token:h.lastToken(h.worker.email,'invite')},h.worker);
 const w=await h.request(base,'GET',{},h.worker);assert.deepEqual(new Set(w.data.branches.map(x=>x.id)),new Set([a,aChild]));assert.equal(w.data.onboarding.length,0);
 assert.equal((await h.request(base,'PATCH',{name:'Hijack'},h.worker)).status,403);
 assert.equal((await h.request(`${base}/branches`,'POST',{name:'Sibling invasion',label:'Group',parent_id:b},h.worker)).status,403);
 assert.equal((await h.request(`${base}/branches`,'POST',{name:'Allowed group',label:'Group',parent_id:aChild},h.worker)).status,201);
 assert.equal((await h.request(`${base}/roles`,'POST',{name:'Escalated role',permissions:['church.read']},h.worker)).status,403);
 const admin=h.roles.find(r=>r.builtin==='church_admin');
 assert.equal((await h.request(`${base}/invitations`,'POST',{email:'new@example.test',role_id:admin.id,branch_id:a},h.worker)).status,403);
 assert.equal((await h.request(`${base}/invitations`,'POST',{email:'new@example.test',role_id:h.roles.find(r=>r.builtin==='member').id,branch_id:b},h.worker)).status,403);
});
test('custom role validation, membership changes and removal take effect immediately',async()=>{
 const h=await inviteFixture(),base=`/api/churches/${h.c}`,media=h.roles.find(r=>r.builtin==='media'),member=h.roles.find(r=>r.builtin==='member');
 assert.equal((await h.request(`${base}/roles`,'POST',{name:'Bad role',permissions:['platform.admin']},h.owner)).status,400);
 await h.request(`${base}/invitations`,'POST',{email:h.worker.email,role_id:media.id},h.owner);
 await h.request('/api/invitations/accept','POST',{token:h.lastToken(h.worker.email,'invite')},h.worker);
 const team=(await h.request(`${base}/team`,'GET',{},h.owner)).data.members;
 const worker=team.find(m=>m.email===h.worker.email),owner=team.find(m=>m.email===h.owner.email);
 assert.equal((await h.request(`${base}/team/${owner.id}`,'DELETE',{},h.owner)).status,400);
 assert.equal((await h.request(`${base}/team/${worker.id}`,'PATCH',{role_id:member.id},h.owner)).status,undefined);
 assert.equal((await h.request(base,'GET',{},h.worker)).status,403);
 assert.equal((await h.request(`${base}/team/${worker.id}`,'DELETE',{},h.owner)).status,undefined);
 assert.equal((await h.request(base,'GET',{},h.worker)).status,404);
});
test('profile and multiple visions and missions drive derived onboarding progress',async()=>{
 const h=harness(),s=await h.register('setup@example.test'),c=await h.church(s,'setup-church','independent'),base=`/api/churches/${c}`;
 let w=await h.request(base,'GET',{},s);assert.equal(w.data.onboarding.filter(x=>x.done).length,2);
 assert.equal((await h.request(base,'PATCH',{welcome:'Welcome to our family',service_times:'Sunday 9 AM',template:'open-doors'},s)).status,undefined);
 for(const kind of ['vision','vision','mission'])assert.equal((await h.request(`${base}/statements`,'POST',{kind,title:`Our ${kind}`,body:'To serve the community faithfully.'},s)).status,201);
 w=await h.request(base,'GET',{},s);assert.equal(w.data.onboarding.filter(x=>x.done).length,5);
 const rows=(await h.request(`${base}/statements`,'GET',{},s)).data.statements;assert.equal(rows.length,3);
 assert.equal((await h.request(`${base}/statements/${rows[0].id}`,'PATCH',{title:'Updated purpose',body:'A revised statement of purpose.',position:2},s)).status,undefined);
 assert.equal((await h.request(`${base}/statements/${rows[0].id}`,'DELETE',{},s)).status,undefined);
 assert.equal((await h.request(base,'PATCH',{template:'not-a-template'},s)).status,400);
 assert.equal((await h.request(`${base}/branches`,'POST',{name:'Second location',label:'Branch'},s)).status,400);
});
test('suspended churches deny access and invitation acceptance',async()=>{
 const h=await inviteFixture(),role=h.roles.find(r=>r.builtin==='member');
 await h.request(`/api/churches/${h.c}/invitations`,'POST',{email:h.worker.email,role_id:role.id},h.owner);
 h.db.prepare('UPDATE churches SET status=\'suspended\' WHERE id=?').run(h.c);
 assert.equal((await h.request(`/api/churches/${h.c}`,'GET',{},h.owner)).status,403);
 assert.equal((await h.request('/api/invitations/accept','POST',{token:h.lastToken(h.worker.email,'invite')},h.worker)).status,400);
});
test('audit records are append-only and membership changes roll back if audit fails',async()=>{
 const h=harness(),s=await h.register('audit@example.test'),c=await h.church(s);
 assert.throws(()=>h.db.prepare('UPDATE audit SET action=?').run('tampered'),/append-only/);
 assert.throws(()=>h.db.exec('DELETE FROM audit'),/append-only/);
 h.db.exec("CREATE TRIGGER fail_update_audit BEFORE INSERT ON audit WHEN NEW.action='church.update' BEGIN SELECT RAISE(ABORT,'forced'); END;");
 assert.equal((await h.request(`/api/churches/${c}`,'PATCH',{name:'Should roll back'},s)).status,500);
 assert.equal(h.db.prepare('SELECT name FROM churches').get().name,'Test ministry');
});
test('persistent rate limits block repeated login and reset attempts',async()=>{
 const h=harness();for(let i=0;i<10;i++)assert.equal((await h.request('/api/auth/login','POST',{email:'unknown@example.test',password:'wrong password'})).status,401);
 assert.equal((await h.request('/api/auth/login','POST',{email:'unknown@example.test',password:'wrong password'})).status,429);
});
test('expired sessions and logout revoke access',async()=>{
 const h=harness(),s=await h.register('logout@example.test');
 assert.equal((await h.request('/api/auth/logout','POST',{},s)).status,undefined);assert.equal((await h.request('/api/me','GET',{},s)).status,401);
 const login=await h.request('/api/auth/login','POST',{email:s.email,password:'A long test passphrase 123'});const session={cookie:login.cookie.split(';')[0],csrf:login.data.csrf};
 h.db.prepare('UPDATE sessions SET expires_at=0').run();assert.equal((await h.request('/api/me','GET',{},session)).status,401);
});
test('mail worker encrypts content, uses idempotency and retries failures without losing the message',async()=>{
 const h=harness();await h.register('mail@example.test',false);const config={mailKey:'test-key',mailFrom:'test@example.test',outboxKey};
 const row=h.db.prepare('SELECT * FROM outbox').get();assert.ok(!row.payload.includes('token='));
 const failed=await deliverMail(h.db,config,async()=>({ok:false,status:503}));assert.equal(failed.delivered,false);
 assert.equal(h.db.prepare('SELECT attempts FROM outbox').get().attempts,1);
 h.db.prepare('UPDATE outbox SET next_attempt_at=0').run();
 let payload;const sent=await deliverMail(h.db,config,async(url,options)=>{payload=JSON.parse(options.body);assert.equal(options.headers['Idempotency-Key'],`jesusseat/${row.id}`);return {ok:true};});
 assert.equal(sent.delivered,true);assert.ok(payload.text.includes('/verify#token='));
 const after=h.db.prepare('SELECT * FROM outbox').get();assert.ok(after.sent_at);assert.equal(after.payload,'[delivered]');
});
test('HTTP server enforces JSON, body limits, same origin and security headers',async()=>{
 const db=openDatabase(':memory:'),server=createHttpServer({origin,outboxKey,production:false},db);
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url=`http://127.0.0.1:${server.address().port}`;
 try{
   const html=await fetch(url+'/app');assert.equal(html.status,200);assert.match(html.headers.get('content-security-policy'),/frame-ancestors 'none'/);assert.equal(html.headers.get('cache-control'),'no-store');
   assert.equal((await fetch(url+'/api/health')).status,200);
   assert.equal((await fetch(url+'/api/auth/register',{method:'POST',headers:{origin,'Content-Type':'text/plain'},body:'{}'})).status,415);
   assert.equal((await fetch(url+'/api/auth/register',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:'{'})).status,400);
   assert.equal((await fetch(url+'/api/auth/register',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:'[]'})).status,400);
   assert.equal((await fetch(url+'/api/auth/register',{method:'POST',headers:{origin:'https://bad.example','Content-Type':'application/json'},body:'{}'})).status,403);
   assert.equal((await fetch(url+'/api/auth/register',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify({large:'a'.repeat(33000)})})).status,413);
   assert.equal((await fetch(url+'/.env')).status,404);assert.equal((await fetch(url+'/src/schema.sql')).status,404);
 }finally{await new Promise(resolve=>server.close(resolve));db.close();}
});
test('production refuses insecure origins or missing email credentials',()=>{
 assert.throws(()=>loadConfig({NODE_ENV:'production',APP_ORIGIN:'http://example.test'}),/HTTPS/);
 assert.throws(()=>loadConfig({NODE_ENV:'production',APP_ORIGIN:'https://example.test'}),/Configure/);
 assert.throws(()=>loadConfig({APP_ORIGIN:'https://example.test/path'}),/canonical/);
});
test('a consistent backup restores church data and permissions after reopening',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'jesusseat-test-'));
 const h=harness(),s=await h.register('backup@example.test'),c=await h.church(s,'backup-church');
 try{
   await backup(h.db,join(dir,'backup.sqlite'));
   const restored=openDatabase(join(dir,'backup.sqlite'));
   assert.equal(restored.prepare('SELECT email FROM users').get().email,'backup@example.test');
   assert.equal(restored.prepare('SELECT slug FROM churches WHERE id=?').get(c).slug,'backup-church');
   assert.equal(restored.prepare('SELECT count(*) n FROM memberships WHERE church_id=?').get(c).n,1);
   assert.equal(restored.prepare('SELECT count(*) n FROM roles WHERE church_id=?').get(c).n,11);
   assert.equal(restored.prepare('PRAGMA foreign_keys').get().foreign_keys,1);
   assert.equal(restored.prepare('SELECT version FROM schema_migrations').get().version,1);
   restored.close();
 }finally{h.db.close();rmSync(dir,{recursive:true,force:true});}
});
test('concurrent invitation acceptance grants exactly one membership',async()=>{
 const h=await inviteFixture(),role=h.roles.find(r=>r.builtin==='member');
 await h.request(`/api/churches/${h.c}/invitations`,'POST',{email:h.worker.email,role_id:role.id},h.owner);
 const token=h.lastToken(h.worker.email,'invite');
 const results=await Promise.all([h.request('/api/invitations/accept','POST',{token},h.worker),h.request('/api/invitations/accept','POST',{token},h.worker)]);
 assert.equal(results.filter(r=>r.status===undefined).length,1);assert.equal(results.filter(r=>r.status===400).length,1);
 assert.equal(h.db.prepare('SELECT count(*) n FROM memberships WHERE church_id=?').get(h.c).n,2);
});
test('production sessions are Secure host-only cookies and cannot be used with development cookie name',async()=>{
 const h=harness(),s=await h.register('secure@example.test');
 const app=createApp({db:h.db,origin:'https://church.example.test',production:true,outboxKey});
 const login=await app({method:'POST',path:'/api/auth/login',body:{email:s.email,password:'A long test passphrase 123'},ip:'prod-test',headers:{origin:'https://church.example.test'}});
 assert.match(login.cookie,/^__Host-jesusseat=/);assert.match(login.cookie,/; Secure$/);assert.ok(!login.cookie.includes('Domain='));
 assert.equal((await app({method:'GET',path:'/api/me',headers:{cookie:s.cookie}})).status,401);
});

async function secondSession(h,s){
 const r=await h.request('/api/auth/login','POST',{email:s.email,password:'A long test passphrase 123'});
 assert.equal(r.status,undefined);return {cookie:r.cookie.split(';')[0],csrf:r.data.csrf,email:s.email};
}
test('session inventory is private and returns revocation handles rather than bearer credentials',async()=>{
 const h=harness(),a=await h.register('sessions-a@example.test'),a2=await secondSession(h,a),b=await h.register('sessions-b@example.test');
 const rows=(await h.request('/api/auth/sessions','GET',{},a)).data.sessions;
 assert.equal(rows.length,2);assert.equal(rows.filter(r=>r.current).length,1);
 const privateHashes=h.db.prepare('SELECT token_hash FROM sessions').all().map(r=>r.token_hash);
 for(const row of rows){assert.equal(row.id.length,64);assert.ok(!privateHashes.includes(row.id));assert.ok(row.startedAt<row.expiresAt);assert.ok(!('csrf' in row));}
 const other=(await h.request('/api/auth/sessions','GET',{},b)).data.sessions[0];
 assert.equal((await h.request(`/api/auth/sessions/${other.id}`,'DELETE',{},a)).status,404);
 const aOther=rows.find(r=>!r.current);
 assert.equal((await h.request(`/api/auth/sessions/${aOther.id}`,'DELETE',{},a)).data.signedOut,false);
 assert.equal((await h.request('/api/me','GET',{},a2)).status,401);
 assert.equal((await h.request('/api/me','GET',{},a)).status,undefined);
 assert.equal((await h.request('/api/me','GET',{},b)).status,undefined);
});
test('revoking the current session clears its cookie; revoke-others preserves other accounts',async()=>{
 const h=harness(),a=await h.register('signouts@example.test'),a2=await secondSession(h,a),b=await h.register('unaffected@example.test');
 assert.equal((await h.request('/api/auth/logout-others','POST',{},a)).data.count,1);
 assert.equal((await h.request('/api/me','GET',{},a2)).status,401);
 assert.equal((await h.request('/api/me','GET',{},b)).status,undefined);
 const current=(await h.request('/api/auth/sessions','GET',{},a)).data.sessions[0];
 const r=await h.request(`/api/auth/sessions/${current.id}`,'DELETE',{},a);assert.equal(r.data.signedOut,true);assert.match(r.cookie,/Max-Age=0/);
 assert.equal((await h.request('/api/me','GET',{},a)).status,401);
});
test('password changes require the current password, rotate the session and invalidate resets',async()=>{
 const h=harness(),a=await h.register('password-change@example.test'),a2=await secondSession(h,a);
 await h.request('/api/auth/forgot','POST',{email:a.email});const token=h.lastToken(a.email,'reset');
 assert.equal((await h.request('/api/auth/password','POST',{currentPassword:'wrong',password:'New long password value'},a)).status,403);
 assert.equal((await h.request('/api/auth/password','POST',{currentPassword:'A long test passphrase 123',password:'short'},a)).status,400);
 const r=await h.request('/api/auth/password','POST',{currentPassword:'A long test passphrase 123',password:'New long password value'},a);assert.equal(r.status,undefined);
 const fresh={cookie:r.cookie.split(';')[0],csrf:r.data.csrf};assert.notEqual(fresh.cookie,a.cookie);assert.notEqual(fresh.csrf,a.csrf);
 assert.equal((await h.request('/api/me','GET',{},a)).status,401);assert.equal((await h.request('/api/me','GET',{},a2)).status,401);
 assert.equal((await h.request('/api/me','GET',{},fresh)).status,undefined);
 assert.equal((await h.request('/api/auth/reset','POST',{token,password:'Another new password value'})).status,400);
 assert.equal((await h.request('/api/auth/login','POST',{email:a.email,password:'New long password value'})).status,undefined);
 const mail=h.db.prepare("SELECT * FROM outbox WHERE subject='Your JesusSeat password was changed'").get();assert.ok(mail);
 assert.ok(!decrypt(mail.payload,outboxKey).includes('New long password value'));
});
test('concurrent password changes cannot both commit using the old credential',async()=>{
 const h=harness(),a=await h.register('concurrent-password@example.test');
 const responses=await Promise.all(['First new long passphrase','Second new long passphrase'].map(password=>h.request('/api/auth/password','POST',{currentPassword:'A long test passphrase 123',password},a)));
 assert.equal(responses.filter(r=>r.status===undefined).length,1);
 assert.equal(responses.filter(r=>r.status===409).length,1);
 assert.equal(h.db.prepare('SELECT count(*) n FROM sessions').get().n,1);
});
test('password and session changes roll back if their audit record cannot commit',async()=>{
 const h=harness(),a=await h.register('password-rollback@example.test'),a2=await secondSession(h,a);
 const original=h.db.prepare('SELECT password_hash FROM users').get().password_hash;
 h.db.exec("CREATE TRIGGER stop_security_audit BEFORE INSERT ON audit WHEN NEW.action IN ('account.password_change','account.other_sessions_revoke') BEGIN SELECT RAISE(ABORT,'forced'); END;");
 assert.equal((await h.request('/api/auth/password','POST',{currentPassword:'A long test passphrase 123',password:'A replacement long password'},a)).status,500);
 assert.equal(h.db.prepare('SELECT password_hash FROM users').get().password_hash,original);
 assert.equal((await h.request('/api/auth/logout-others','POST',{},a)).status,500);
 assert.equal((await h.request('/api/me','GET',{},a2)).status,undefined);
 assert.equal(h.db.prepare("SELECT count(*) n FROM outbox WHERE subject='Your JesusSeat password was changed'").get().n,0);
});
test('custom role updates require current revision and confirm expanded access for members',async()=>{
 const h=await inviteFixture(),base=`/api/churches/${h.c}`;
 const roleId=(await h.request(`${base}/roles`,'POST',{name:'Communications assistant',permissions:['church.read']},h.owner)).data.id;
 await h.request(`${base}/invitations`,'POST',{email:h.worker.email,role_id:roleId},h.owner);
 await h.request('/api/invitations/accept','POST',{token:h.lastToken(h.worker.email,'invite')},h.worker);
 let role=(await h.request(`${base}/roles`,'GET',{},h.owner)).data.roles.find(r=>r.id===roleId);
 assert.equal(role.assigned_members,1);
 const payload={name:'Communications lead',permissions:['church.read','media.manage'],version:role.version};
 assert.equal((await h.request(`${base}/roles/${roleId}`,'PATCH',payload,h.owner)).status,409);
 assert.equal((await h.request(`${base}/roles/${roleId}`,'PATCH',{...payload,confirmExpansion:true},h.owner)).status,undefined);
 assert.ok((await h.request(base,'GET',{},h.worker)).data.permissions.includes('media.manage'));
 assert.equal((await h.request(`${base}/roles/${roleId}`,'PATCH',{...payload,confirmExpansion:true},h.owner)).status,409);
 role=(await h.request(`${base}/roles`,'GET',{},h.owner)).data.roles.find(r=>r.id===roleId);
 assert.equal((await h.request(`${base}/roles/${roleId}`,'DELETE',{version:role.version},h.owner)).status,409);
 assert.equal((await h.request(`${base}/roles/${roleId}`,'PATCH',{name:role.name,permissions:['church.read'],version:role.version},h.owner)).status,undefined);
 assert.deepEqual((await h.request(base,'GET',{},h.worker)).data.permissions,['church.read']);
});
test('role expansion also accounts for pending invitations and does not alter built-ins',async()=>{
 const h=await inviteFixture(),base=`/api/churches/${h.c}`;
 const roleId=(await h.request(`${base}/roles`,'POST',{name:'Future media',permissions:['church.read']},h.owner)).data.id;
 await h.request(`${base}/invitations`,'POST',{email:h.worker.email,role_id:roleId},h.owner);
 const role=(await h.request(`${base}/roles`,'GET',{},h.owner)).data.roles.find(r=>r.id===roleId);
 assert.equal(role.pending_invitations,1);
 assert.equal((await h.request(`${base}/roles/${roleId}`,'PATCH',{name:role.name,permissions:['church.read','media.manage'],version:role.version},h.owner)).status,409);
 const builtin=(await h.request(`${base}/roles`,'GET',{},h.owner)).data.roles.find(r=>r.builtin==='member');
 assert.equal((await h.request(`${base}/roles/${builtin.id}`,'PATCH',{name:'Altered member',permissions:['church.read'],version:builtin.version},h.owner)).status,403);
 assert.equal((await h.request(`${base}/roles/${builtin.id}`,'DELETE',{version:builtin.version},h.owner)).status,403);
});
test('archiving unused roles preserves invitation history and rejects reuse',async()=>{
 const h=await inviteFixture(),base=`/api/churches/${h.c}`;
 const roleId=(await h.request(`${base}/roles`,'POST',{name:'Temporary volunteer',permissions:['church.read']},h.owner)).data.id;
 await h.request(`${base}/invitations`,'POST',{email:h.worker.email,role_id:roleId},h.owner);
 const token=h.lastToken(h.worker.email,'invite'),inv=h.db.prepare('SELECT id FROM invitations WHERE token_hash=?').get(digest(token));
 let role=(await h.request(`${base}/roles`,'GET',{},h.owner)).data.roles.find(r=>r.id===roleId);
 assert.equal((await h.request(`${base}/roles/${roleId}`,'DELETE',{version:role.version},h.owner)).status,409);
 await h.request(`${base}/invitations/${inv.id}`,'DELETE',{},h.owner);
 assert.equal((await h.request(`${base}/roles/${roleId}`,'DELETE',{version:role.version},h.owner)).status,undefined);
 assert.ok(h.db.prepare('SELECT archived_at FROM roles WHERE id=?').get(roleId).archived_at);
 assert.ok(h.db.prepare('SELECT role_id FROM invitations WHERE id=?').get(inv.id));
 assert.ok(!(await h.request(`${base}/roles`,'GET',{},h.owner)).data.roles.some(r=>r.id===roleId));
 assert.equal((await h.request(`${base}/invitations`,'POST',{email:'another@example.test',role_id:roleId},h.owner)).status,400);
 assert.equal((await h.request('/api/invitations/accept','POST',{token},h.worker)).status,400);
});
test('custom role edits block cross-church access, self-modification and audit failure',async()=>{
 const h=await inviteFixture(),base=`/api/churches/${h.c}`;
 const roleId=(await h.request(`${base}/roles`,'POST',{name:'Access coordinator',permissions:['church.read','team.read','roles.manage']},h.owner)).data.id;
 await h.request(`${base}/invitations`,'POST',{email:h.worker.email,role_id:roleId},h.owner);
 await h.request('/api/invitations/accept','POST',{token:h.lastToken(h.worker.email,'invite')},h.worker);
 const role=(await h.request(`${base}/roles`,'GET',{},h.owner)).data.roles.find(r=>r.id===roleId);
 const payload={name:'Renamed coordinator',permissions:role.permissions,version:role.version};
 assert.equal((await h.request(`${base}/roles/${roleId}`,'PATCH',payload,h.worker)).status,403);
 const stranger=await h.register('role-stranger@example.test'),other=await h.church(stranger,'another-church');
 assert.equal((await h.request(`/api/churches/${other}/roles/${roleId}`,'PATCH',payload,stranger)).status,404);
 h.db.exec("CREATE TRIGGER stop_role_audit BEFORE INSERT ON audit WHEN NEW.action='role.update' BEGIN SELECT RAISE(ABORT,'forced'); END;");
 assert.equal((await h.request(`${base}/roles/${roleId}`,'PATCH',payload,h.owner)).status,500);
 assert.equal(h.db.prepare('SELECT name FROM roles WHERE id=?').get(roleId).name,'Access coordinator');
});
test('opening a version-one database upgrades roles without losing records and is repeatable',()=>{
 const dir=mkdtempSync(join(tmpdir(),'jesusseat-upgrade-')),path=join(dir,'legacy.sqlite');
 const legacy=new DatabaseSync(path);
 const originalSchema=readFileSync(new URL('../src/schema.sql',import.meta.url),'utf8').replace(', archived_at INTEGER','').replace(/CREATE TABLE IF NOT EXISTS platform_admins[\s\S]*?(?=INSERT OR IGNORE INTO schema_migrations)/,'')
   .replace(/CREATE TABLE IF NOT EXISTS account_mfa[\s\S]*?CREATE INDEX IF NOT EXISTS mfa_challenge_user ON mfa_challenges\(user_id\);/,'');
 legacy.exec(originalSchema);
 const uid=id(),cid=id(),rid=id();
 legacy.prepare('INSERT INTO users(id,name,email,password_hash,created_at) VALUES(?,?,?,?,?)').run(uid,'Legacy user','legacy@example.test','test-only-unused',Date.now());
 legacy.prepare('INSERT INTO churches(id,name,slug,structure,country,city,timezone,policy_version,accepted_by,accepted_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(cid,'Legacy church','legacy-church','independent','Nigeria','Abuja','Africa/Lagos',POLICY_VERSION,uid,Date.now(),Date.now());
 legacy.prepare('INSERT INTO roles VALUES(?,?,?,?,?)').run(rid,cid,'Legacy custom',null,'["church.read"]');legacy.close();
 try{
   for(let i=0;i<2;i++){
     const upgraded=openDatabase(path);
     assert.equal(upgraded.prepare('SELECT name,archived_at FROM roles WHERE id=?').get(rid).name,'Legacy custom');
     assert.equal(upgraded.prepare('SELECT max(version) version FROM schema_migrations').get().version,5);
     assert.equal(upgraded.prepare("SELECT count(*) n FROM sqlite_master WHERE type='table' AND name IN ('account_mfa','recovery_codes','mfa_enrollments','mfa_challenges')").get().n,4);
     assert.equal(upgraded.prepare('SELECT count(*) n FROM churches').get().n,1);upgraded.close();
   }
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('TOTP and HOTP match independent RFC 6238 and 4226 reference vectors',()=>{
 const bytes=Buffer.from('12345678901234567890'),seed=encodeBase32(bytes);
 assert.equal(seed,'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');assert.deepEqual(decodeBase32(seed),bytes);
 for(const [seconds,expected] of [[59,'94287082'],[1111111109,'07081804'],[1111111111,'14050471'],[1234567890,'89005924'],[2000000000,'69279037'],[20000000000,'65353130']])assert.equal(totp(seed,seconds*1000,8),expected);
 ['755224','287082','359152','969429','338314','254676','287922','162583','399871','520489'].forEach((expected,index)=>assert.equal(hotp(seed,index),expected));
 const now=1234567890000,step=Math.floor(now/30000);assert.equal(matchTotp(seed,hotp(seed,step),-1,now),step);
 assert.equal(matchTotp(seed,hotp(seed,step),step,now),null);assert.equal(matchTotp(seed,'12345',-1,now),null);
});
function clockFor(t){const clock={now:1900000000000};t.mock.method(Date,'now',()=>clock.now);return clock;}
const sessionFrom=(result,email,cookies=result.cookies)=>({cookie:(result.cookie||cookies.find(c=>c.startsWith('jesusseat='))).split(';')[0],csrf:result.data.csrf,email});
async function enabledMfa(t){
 const clock=clockFor(t),h=harness(),owner=await h.register('mfa-owner@example.test');
 const started=await h.request('/api/auth/mfa/setup','POST',{currentPassword:'A long test passphrase 123'},owner);
 assert.equal(started.status,undefined);const seed=started.data.secret;
 const confirmed=await h.request('/api/auth/mfa/confirm','POST',{code:totp(seed)},owner);assert.equal(confirmed.status,undefined,JSON.stringify(confirmed.data));
 return {...h,clock,owner,seed,codes:confirmed.data.codes,session:sessionFrom(confirmed,owner.email)};
}
async function loginChallenge(h,password='A long test passphrase 123'){
 const result=await h.request('/api/auth/login','POST',{email:h.owner.email,password});
 assert.equal(result.data.mfaRequired,true);return {cookie:result.cookie.split(';')[0],csrf:result.data.csrf};
}
function invalidCode(seed){const current=Math.floor(Date.now()/30000),valid=new Set([-1,0,1].map(offset=>hotp(seed,current+offset)));return ['000000','111111','222222','333333'].find(code=>!valid.has(code));}

test('MFA enrollment requires password and originating session, encrypts the seed and rotates sessions',async t=>{
 clockFor(t);const h=harness(),owner=await h.register('enroll@example.test'),second=await secondSession(h,owner);
 assert.equal((await h.request('/api/auth/mfa/setup','POST',{currentPassword:'wrong'},owner)).status,403);
 const started=await h.request('/api/auth/mfa/setup','POST',{currentPassword:'A long test passphrase 123'},owner),seed=started.data.secret;
 assert.equal(started.data.digits,6);assert.equal(started.data.period,30);
 const pending=h.db.prepare('SELECT * FROM mfa_enrollments').get();assert.ok(!pending.secret_cipher.includes(seed));assert.equal(decrypt(pending.secret_cipher,outboxKey),seed);
 assert.equal((await h.request('/api/auth/mfa/confirm','POST',{code:totp(seed)},second)).status,400);
 assert.equal((await h.request('/api/auth/mfa/confirm','POST',{code:invalidCode(seed)},owner)).status,400);
 const confirmed=await h.request('/api/auth/mfa/confirm','POST',{code:totp(seed)},owner),fresh=sessionFrom(confirmed,owner.email);
 assert.equal(confirmed.data.codes.length,10);assert.equal(new Set(confirmed.data.codes).size,10);
 assert.equal((await h.request('/api/me','GET',{},owner)).status,401);assert.equal((await h.request('/api/me','GET',{},second)).status,401);
 const status=(await h.request('/api/auth/mfa','GET',{},fresh)).data;assert.equal(status.enabled,true);assert.equal(status.recoveryCodesRemaining,10);assert.ok(!('secret' in status));
 const row=h.db.prepare('SELECT * FROM recovery_codes LIMIT 1').get();assert.ok(!confirmed.data.codes.includes(row.code_hash));
 assert.equal(h.db.prepare('SELECT count(*) n FROM mfa_enrollments').get().n,0);
});
test('MFA login has no full session until the second factor succeeds and cannot replay codes',async t=>{
 const h=await enabledMfa(t);h.clock.now+=30000;
 const challenge=await loginChallenge(h);
 assert.equal((await h.request('/api/me','GET',{},challenge)).status,401);
 assert.equal((await h.request('/api/auth/mfa/challenge','GET',{},challenge)).data.csrf,challenge.csrf);
 assert.equal((await h.request('/api/auth/mfa/login','POST',{code:totp(h.seed)},challenge,{'x-csrf-token':'wrong'})).status,403);
 const success=await h.request('/api/auth/mfa/login','POST',{code:totp(h.seed)},challenge);assert.equal(success.status,undefined);
 assert.ok(success.cookies.some(cookie=>cookie.startsWith('jesusseat-mfa=;')&&cookie.includes('Max-Age=0')));
 const fresh=sessionFrom(success,h.owner.email);assert.equal((await h.request('/api/me','GET',{},fresh)).status,undefined);
 assert.equal((await h.request('/api/auth/mfa/login','POST',{code:totp(h.seed)},challenge)).status,401);
 const next=await loginChallenge(h);assert.equal((await h.request('/api/auth/mfa/login','POST',{code:totp(h.seed)},next)).status,401);
 h.clock.now+=30000;assert.equal((await h.request('/api/auth/mfa/login','POST',{code:totp(h.seed)},next)).status,undefined);
});
test('one-use recovery codes work for MFA sign-in and cannot be reused',async t=>{
 const h=await enabledMfa(t),challenge=await loginChallenge(h);
 assert.equal((await h.request('/api/auth/mfa/login','POST',{code:h.codes[0]},challenge)).status,undefined);
 assert.equal((await h.request('/api/auth/mfa','GET',{},h.session)).data.recoveryCodesRemaining,9);
 const retry=await loginChallenge(h);assert.equal((await h.request('/api/auth/mfa/login','POST',{code:h.codes[0]},retry)).status,401);
 assert.equal((await h.request('/api/auth/mfa/login','POST',{code:h.codes[1]},retry)).status,undefined);
});
test('MFA attempts persist on failures; challenges and enrollment expire',async t=>{
 const h=await enabledMfa(t),challenge=await loginChallenge(h),bad=invalidCode(h.seed);
 for(let i=0;i<5;i++)assert.equal((await h.request('/api/auth/mfa/login','POST',{code:bad},challenge)).status,401);
 assert.equal(h.db.prepare('SELECT attempts FROM mfa_challenges').get().attempts,5);
 assert.equal((await h.request('/api/auth/mfa/login','POST',{code:h.codes[0]},challenge)).status,401);
 const next=await loginChallenge(h);h.clock.now+=5*60000+1;
 assert.equal((await h.request('/api/auth/mfa/login','POST',{code:h.codes[0]},next)).status,401);
 const other=await h.register('pending-mfa@example.test');
 const setup=await h.request('/api/auth/mfa/setup','POST',{currentPassword:'A long test passphrase 123'},other);
 h.clock.now+=10*60000+1;
 assert.equal((await h.request('/api/auth/mfa/confirm','POST',{code:totp(setup.data.secret)},other)).status,400);
});
test('password recovery preserves MFA while invalidating pending sign-ins',async t=>{
 const h=await enabledMfa(t),challenge=await loginChallenge(h);
 await h.request('/api/auth/forgot','POST',{email:h.owner.email});const token=h.lastToken(h.owner.email,'reset');
 assert.equal((await h.request('/api/auth/reset','POST',{token,password:'A new recovery passphrase'})).status,undefined);
 assert.equal((await h.request('/api/auth/mfa/login','POST',{code:h.codes[0]},challenge)).status,401);
 const next=await loginChallenge(h,'A new recovery passphrase');
 assert.equal((await h.request('/api/auth/mfa/login','POST',{code:h.codes[0]},next)).status,undefined);
 assert.equal(h.db.prepare('SELECT count(*) n FROM account_mfa').get().n,1);
});
test('disabling MFA requires current password plus an unused factor and revokes other sessions',async t=>{
 const h=await enabledMfa(t),challenge=await loginChallenge(h),login=await h.request('/api/auth/mfa/login','POST',{code:h.codes[0]},challenge),other=sessionFrom(login,h.owner.email);
 assert.equal((await h.request('/api/auth/mfa/disable','POST',{currentPassword:'wrong',code:h.codes[1]},h.session)).status,403);
 assert.equal((await h.request('/api/auth/mfa/disable','POST',{currentPassword:'A long test passphrase 123',code:invalidCode(h.seed)},h.session)).status,403);
 const result=await h.request('/api/auth/mfa/disable','POST',{currentPassword:'A long test passphrase 123',code:h.codes[1]},h.session);assert.equal(result.status,undefined);
 const fresh=sessionFrom(result,h.owner.email);assert.equal((await h.request('/api/auth/mfa','GET',{},fresh)).data.enabled,false);
 assert.equal((await h.request('/api/me','GET',{},other)).status,401);
 assert.equal(h.db.prepare('SELECT count(*) n FROM recovery_codes').get().n,0);
 const normal=await h.request('/api/auth/login','POST',{email:h.owner.email,password:'A long test passphrase 123'});assert.ok(!normal.data.mfaRequired);assert.ok(normal.cookie.startsWith('jesusseat='));
});
test('replacing recovery codes invalidates old codes, rotates sessions and preserves MFA',async t=>{
 const h=await enabledMfa(t),result=await h.request('/api/auth/mfa/recovery-codes','POST',{currentPassword:'A long test passphrase 123',code:h.codes[0]},h.session);
 assert.equal(result.status,undefined);assert.equal(result.data.codes.length,10);
 assert.equal((await h.request('/api/me','GET',{},h.session)).status,401);
 const fresh=sessionFrom(result,h.owner.email);assert.equal((await h.request('/api/auth/mfa','GET',{},fresh)).data.enabled,true);
 const challenge=await loginChallenge(h);assert.equal((await h.request('/api/auth/mfa/login','POST',{code:h.codes[1]},challenge)).status,401);
 assert.equal((await h.request('/api/auth/mfa/login','POST',{code:result.data.codes[0]},challenge)).status,undefined);
});
test('MFA mutations and consumed factors roll back on audit failure',async t=>{
 const h=await enabledMfa(t);
 h.db.exec("CREATE TRIGGER stop_mfa_changes BEFORE INSERT ON audit WHEN NEW.action='account.mfa_disabled' BEGIN SELECT RAISE(ABORT,'forced'); END;");
 const r=await h.request('/api/auth/mfa/disable','POST',{currentPassword:'A long test passphrase 123',code:h.codes[0]},h.session);assert.equal(r.status,500);
 assert.equal((await h.request('/api/auth/mfa','GET',{},h.session)).data.enabled,true);
 assert.equal((await h.request('/api/auth/mfa','GET',{},h.session)).data.recoveryCodesRemaining,10);
 const challenge=await loginChallenge(h);assert.equal((await h.request('/api/auth/mfa/login','POST',{code:h.codes[0]},challenge)).status,undefined);
});
test('MFA status is account-bound and factor codes cannot authenticate another user',async t=>{
 const h=await enabledMfa(t),other=await h.register('mfa-other@example.test');
 assert.equal((await h.request('/api/auth/mfa','GET',{},other)).data.enabled,false);
 assert.equal((await h.request('/api/auth/mfa/disable','POST',{currentPassword:'A long test passphrase 123',code:h.codes[0]},other)).status,403);
 assert.equal(h.db.prepare('SELECT count(*) n FROM recovery_codes').get().n,10);
 assert.equal((await h.request('/api/auth/mfa','GET',{},h.session)).data.enabled,true);
});
test('HTTP MFA sign-in returns separate session and challenge-clear cookies',async t=>{
 const h=await enabledMfa(t),server=createHttpServer({origin,outboxKey,production:false},h.db);
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${server.address().port}`;
 try{
   assert.equal((await fetch(base+'/mfa')).status,200);
   const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify({email:h.owner.email,password:'A long test passphrase 123'})});
   const data=await login.json(),cookie=login.headers.getSetCookie()[0].split(';')[0];assert.equal(data.mfaRequired,true);
   const verified=await fetch(base+'/api/auth/mfa/login',{method:'POST',headers:{origin,'Content-Type':'application/json',cookie,'x-csrf-token':data.csrf},body:JSON.stringify({code:h.codes[0]})});
   assert.equal(verified.status,200);const cookies=verified.headers.getSetCookie();assert.equal(cookies.length,2);
   const sessionCookie=cookies.find(c=>c.startsWith('jesusseat=')).split(';')[0];assert.ok(cookies.some(c=>c.startsWith('jesusseat-mfa=;')));
   const me=await fetch(base+'/api/me',{headers:{cookie:sessionCookie}});assert.equal(me.status,200);
   assert.equal((await me.json()).user.email,h.owner.email);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
