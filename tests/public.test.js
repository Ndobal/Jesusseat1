import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/db.js';
import { createApp, POLICY_VERSION } from '../src/app.js';
import { createHttpServer } from '../src/server.js';
import { id, secret, digest, encrypt, decrypt } from '../src/security.js';
import { PUBLIC_PATHS, renderPublicPage, sitemap } from '../src/public-pages.js';
import { TEMPLATE_DETAILS, HELP, PRIVACY_VERSION } from '../src/public-data.js';
import { safeExternalUrl } from '../src/public-services.js';
import { loadConfig } from '../src/config.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const origin='http://127.0.0.1:3000',outboxKey='public-test-encryption-key-only';
function fixture(t,options={}) {
 const db=openDatabase(':memory:');t.after(()=>db.close());
 const config={origin,outboxKey,production:false,...options},app=createApp({db,...config});
 let n=0;
 const request=(path,method='GET',body={},s=null,ip='fixture')=>app({path:path.split('?')[0],method,body,ip,query:new URL(path,origin).searchParams,headers:{origin,...(s?{cookie:s.cookie,'x-csrf-token':s.csrf}:{})}});
 const user=({verified=true,mfa=false,admin=false}={})=>{
  const uid=id(),token=secret(),csrf=secret();
  db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?)').run(uid,'Test worker',`worker-${n++}@example.test`,'unused-test-hash',verified?Date.now():null,Date.now());
  db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(digest(token),uid,csrf,Date.now()+3600000);
  if(mfa)db.prepare('INSERT INTO account_mfa VALUES(?,?,?,?)').run(uid,encrypt('TEST-SEED',outboxKey),Date.now(),0);
  if(admin)db.prepare('INSERT INTO platform_admins VALUES(?,?)').run(uid,Date.now());
  return {uid,cookie:`jesusseat=${token}`,csrf};
 };
 const nonce=async()=>{const r=await request('/api/public/contact-token');db.prepare('UPDATE public_contact_tokens SET created_at=created_at-2000').run();return r.data.nonce;};
 const contact=async(extra={},ip='fixture')=>request('/api/public/contact','POST',{name:'Test visitor',email:'visitor@example.test',topic:'support',subject:'Help with setup',message:'Please help us with church setup.',consent:true,privacyVersion:PRIVACY_VERSION,nonce:await nonce(),...extra},null,ip);
 const church=async(s,slug='public-church')=>{const r=await request('/api/churches','POST',{name:'Test ministry',slug,structure:'multi_branch',country:'Nigeria',city:'Abuja',timezone:'Africa/Lagos',acceptPolicy:true,policyVersion:POLICY_VERSION},s);assert.equal(r.status,201);return r.data.id;};
 const listing=(c,s,extra={})=>request(`/api/churches/${c}/directory`,'PATCH',{summary:'A welcoming local church community.',website_url:'https://example.test/',published:true,version:0,...extra},s);
 return {db,config,request,user,nonce,contact,church,listing};
}

test('all public pages, five designs and help guides render independent SEO metadata',t=>{
 const h=fixture(t),paths=[...PUBLIC_PATHS,...TEMPLATE_DETAILS.map(x=>`/templates/${x.id}`),...HELP.map(x=>`/help/${x.slug}`)];
 for(const path of paths){const page=renderPublicPage({path,db:h.db,config:h.config});assert.match(page,/<h1>/);assert.match(page,/<title>.+JesusSeat/);assert.ok(page.includes(`rel="canonical" href="${origin}${path}"`));assert.match(page,/Ndovera Limited/);assert.match(page,/name="description"/);}
 assert.equal(renderPublicPage({path:'/help/unknown',db:h.db,config:h.config}),null);
});
test('contact stores encrypted message and consent before returning a real reference',async t=>{
 const h=fixture(t),r=await h.contact();assert.equal(r.status,202,JSON.stringify(r));
 const row=h.db.prepare('SELECT * FROM public_enquiries').get();assert.equal(decrypt(row.message_cipher,outboxKey),'Please help us with church setup.');assert.ok(!row.message_cipher.includes('church setup'));assert.equal(row.privacy_version,PRIVACY_VERSION);assert.ok(row.consent_at);assert.equal(r.data.reference,row.id.slice(0,8).toUpperCase());assert.equal(h.db.prepare('SELECT count(*) n FROM public_contact_tokens').get().n,0);
});
test('contact requires consent, current privacy notice and valid topic',async t=>{
 const h=fixture(t);for(const extra of [{consent:false},{privacyVersion:'old'},{topic:'invalid'}])assert.equal((await h.contact(extra)).status,400);
 assert.equal(h.db.prepare('SELECT count(*) n FROM public_enquiries').get().n,0);
});
test('contact rejects honeypots, fast, expired and replayed forms',async t=>{
 const h=fixture(t);assert.equal((await h.contact({website:'spam'})).status,400);
 const token=(await h.request('/api/public/contact-token')).data.nonce;
 const body={name:'Test',email:'a@example.test',topic:'general',subject:'Question',message:'Please help with this question.',consent:true,privacyVersion:PRIVACY_VERSION,nonce:token};
 assert.equal((await h.request('/api/public/contact','POST',body)).status,400);
 h.db.prepare('UPDATE public_contact_tokens SET expires_at=0').run();assert.equal((await h.request('/api/public/contact','POST',body)).status,400);
 const used=await h.nonce();assert.equal((await h.request('/api/public/contact','POST',{...body,email:'b@example.test',nonce:used})).status,202);
 assert.equal((await h.request('/api/public/contact','POST',{...body,email:'b@example.test',nonce:used})).status,400);
});
test('contact limits per-address submissions even across client addresses',async t=>{
 const h=fixture(t);for(let i=0;i<3;i++)assert.equal((await h.contact({},`client-${i}`)).status,202);
 assert.equal((await h.contact({},'different-client')).status,429);
});
test('contact and notification roll back together when audit fails',async t=>{
 const h=fixture(t,{notificationEmail:'team@example.test'});
 h.db.exec("CREATE TRIGGER reject_contact BEFORE INSERT ON audit WHEN NEW.action='public.enquiry_received' BEGIN SELECT RAISE(ABORT,'test'); END;");
 assert.equal((await h.contact()).status,500);assert.equal(h.db.prepare('SELECT count(*) n FROM public_enquiries').get().n,0);assert.equal(h.db.prepare('SELECT count(*) n FROM outbox').get().n,0);assert.equal(h.db.prepare('SELECT count(*) n FROM public_contact_tokens').get().n,1);
});
test('optional inbox notifications contain no visitor details or message body',async t=>{
 const h=fixture(t,{notificationEmail:'team@example.test'});await h.contact();const row=h.db.prepare('SELECT * FROM outbox').get();assert.equal(row.recipient,'team@example.test');const payload=decrypt(row.payload,outboxKey);assert.ok(payload.includes('/platform/inbox'));assert.ok(!payload.includes('visitor@example.test'));assert.ok(!payload.includes('Please help us'));
});
test('platform inbox requires explicit grant, verified email and MFA',async t=>{
 const h=fixture(t);assert.equal((await h.request('/api/platform/enquiries')).status,401);
 for(const options of [{},{admin:true},{admin:true,mfa:true,verified:false}])assert.equal((await h.request('/api/platform/enquiries','GET',{},h.user(options))).status,403);
 assert.equal((await h.request('/api/platform/enquiries','GET',{},h.user({admin:true,mfa:true}))).status,undefined);
});
test('church administrators cannot self-grant platform access or read enquiry bodies',async t=>{
 const h=fixture(t),s=h.user();await h.church(s);await h.contact();const eid=h.db.prepare('SELECT id FROM public_enquiries').get().id;
 assert.equal((await h.request(`/api/platform/enquiries/${eid}`,'GET',{},s)).status,403);
 assert.equal((await h.request('/api/platform/admins','POST',{email:'worker-0@example.test'},s)).status,404);
 assert.equal((await h.request('/api/me','GET',{},s)).data.platformAdmin,false);
});
test('platform enquiry replies are encrypted, queued and version checked',async t=>{
 const h=fixture(t),s=h.user({admin:true,mfa:true});await h.contact();const eid=h.db.prepare('SELECT id FROM public_enquiries').get().id;
 const inbox=await h.request('/api/platform/enquiries','GET',{},s);assert.ok(!('message_cipher' in inbox.data.enquiries[0]));
 const path=`/api/platform/enquiries/${eid}`;assert.match((await h.request(path,'GET',{},s)).data.enquiry.message,/church setup/);
 const reply={message:'Thank you, here is the setup guide.',version:1,resolve:true};assert.equal((await h.request(path+'/replies','POST',reply,s)).status,201);
 assert.equal((await h.request(path+'/replies','POST',reply,s)).status,409);assert.equal(h.db.prepare('SELECT count(*) n FROM outbox').get().n,1);
 const details=(await h.request(path,'GET',{},s)).data;assert.equal(details.enquiry.status,'resolved');assert.equal(details.enquiry.version,2);assert.equal(details.replies[0].message,reply.message);
 assert.equal(decrypt(h.db.prepare('SELECT body_cipher FROM public_enquiry_replies').get().body_cipher,outboxKey),reply.message);
 assert.equal((await h.request(path,'PATCH',{status:'open',version:1},s)).status,409);assert.equal((await h.request(path,'PATCH',{status:'open',version:2},s)).status,undefined);
});
test('failed reply audit rolls back reply, status and queued mail',async t=>{
 const h=fixture(t),s=h.user({admin:true,mfa:true});await h.contact();const eid=h.db.prepare('SELECT id FROM public_enquiries').get().id;
 h.db.exec("CREATE TRIGGER reject_reply BEFORE INSERT ON audit WHEN NEW.action='public.enquiry_reply' BEGIN SELECT RAISE(ABORT,'test'); END;");
 assert.equal((await h.request(`/api/platform/enquiries/${eid}/replies`,'POST',{message:'A useful response.',version:1},s)).status,500);
 assert.equal(h.db.prepare('SELECT count(*) n FROM public_enquiry_replies').get().n,0);assert.equal(h.db.prepare('SELECT count(*) n FROM outbox').get().n,0);assert.equal(h.db.prepare('SELECT version FROM public_enquiries').get().version,1);
});
test('directory is private by default and exposes only an explicit public projection',async t=>{
 const h=fixture(t),s=h.user(),c=await h.church(s);assert.equal((await h.request('/api/public/churches')).data.total,0);
 assert.equal((await h.listing(c,s)).status,undefined);
 const row=(await h.request('/api/public/churches')).data.churches[0];assert.deepEqual(Object.keys(row).sort(),['name','slug','city','country','summary','website_url'].sort());
 assert.ok(sitemap(h.db,origin).includes('/churches/public-church'));assert.ok(!JSON.stringify(row).includes('policy_version'));
 assert.equal((await h.listing(c,s,{published:false,version:1})).status,undefined);assert.equal((await h.request('/api/public/churches')).data.total,0);assert.ok(!sitemap(h.db,origin).includes('/churches/public-church'));
});
test('suspended churches disappear from public directory and detail pages',async t=>{
 const h=fixture(t),s=h.user(),c=await h.church(s);await h.listing(c,s);h.db.prepare("UPDATE churches SET status='suspended' WHERE id=?").run(c);
 assert.equal((await h.request('/api/public/churches')).data.total,0);assert.equal(renderPublicPage({path:'/churches/public-church',db:h.db,config:h.config}),null);
});
test('directory edits enforce tenant, permission and church-wide scope',async t=>{
 const h=fixture(t),s=h.user(),other=h.user(),c=await h.church(s);
 assert.equal((await h.listing(c,other)).status,404);
 const branch=h.db.prepare('SELECT id FROM branches WHERE church_id=?').get(c).id;h.db.prepare('UPDATE memberships SET branch_id=? WHERE user_id=?').run(branch,s.uid);assert.equal((await h.listing(c,s)).status,403);
 h.db.prepare('UPDATE memberships SET branch_id=NULL WHERE user_id=?').run(s.uid);h.db.prepare("UPDATE roles SET permissions='[\"church.read\"]' WHERE church_id=? AND builtin='church_admin'").run(c);assert.equal((await h.listing(c,s)).status,403);
});
test('directory stale updates and unsafe external links cannot publish',async t=>{
 const h=fixture(t),s=h.user(),c=await h.church(s);for(const website_url of ['javascript:alert(1)','http://example.test','https://user:pass@example.test'])assert.equal((await h.listing(c,s,{website_url})).status,400);
 await h.listing(c,s);assert.equal((await h.listing(c,s)).status,409);
 assert.equal(safeExternalUrl('https://example.test'),'https://example.test/');
});
test('directory searches treat SQL wildcards literally and reject invalid pages',async t=>{
 const h=fixture(t),s=h.user(),c=await h.church(s);await h.listing(c,s);
 assert.equal((await h.request('/api/public/churches?q=Abuja')).data.total,1);assert.equal((await h.request('/api/public/churches?q=%25')).data.total,0);assert.equal((await h.request('/api/public/churches?q=_')).data.total,0);assert.equal((await h.request('/api/public/churches?page=-1')).status,400);
});
test('directory pagination has stable non-overlapping pages',async t=>{
 const h=fixture(t),s=h.user(),c=await h.church(s);await h.listing(c,s);
 for(let i=0;i<12;i++){
  const cid=id();h.db.prepare(`INSERT INTO churches(id,name,slug,structure,country,city,timezone,policy_version,accepted_by,accepted_at,created_at) SELECT ?,name,?,structure,country,city,timezone,policy_version,accepted_by,accepted_at,created_at FROM churches WHERE id=?`).run(cid,`listed-${i}`,c);
  h.db.prepare('INSERT INTO church_directory(church_id,summary,published,updated_at) VALUES(?,?,1,?)').run(cid,'A public introduction.',Date.now());
 }
 const one=(await h.request('/api/public/churches')).data,two=(await h.request('/api/public/churches?page=2')).data;assert.equal(one.total,13);assert.equal(one.churches.length,12);assert.equal(one.nextPage,2);assert.equal(two.churches.length,1);assert.equal(two.nextPage,null);assert.equal(new Set([...one.churches,...two.churches].map(c=>c.slug)).size,13);
});
test('directory audit failure rolls back publication',async t=>{
 const h=fixture(t),s=h.user(),c=await h.church(s);h.db.exec("CREATE TRIGGER reject_directory BEFORE INSERT ON audit WHEN NEW.action='directory.update' BEGIN SELECT RAISE(ABORT,'test'); END;");
 assert.equal((await h.listing(c,s)).status,500);assert.equal(h.db.prepare('SELECT count(*) n FROM church_directory').get().n,0);assert.equal((await h.request('/api/public/churches')).data.total,0);
});
test('host CLI requires an existing verified MFA account and grants/revokes with audit',t=>{
 const dir=mkdtempSync(join(tmpdir(),'jesusseat-admin-')),path=join(dir,'admin.sqlite'),db=openDatabase(path),uid=id();
 t.after(()=>{db.close();rmSync(dir,{recursive:true,force:true});});
 const run=(...args)=>spawnSync(process.execPath,['scripts/platform-admin.js',...args],{cwd:new URL('..',import.meta.url),encoding:'utf8',env:{...process.env,NODE_ENV:'development',APP_ORIGIN:origin,DATABASE_PATH:path,OUTBOX_KEY:outboxKey}});
 assert.notEqual(run('grant','absent@example.test').status,0);
 db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?)').run(uid,'Fixture operator','operator@example.test','unused-test-hash',null,Date.now());
 assert.notEqual(run('grant','operator@example.test').status,0);db.prepare('UPDATE users SET verified_at=? WHERE id=?').run(Date.now(),uid);assert.notEqual(run('grant','operator@example.test').status,0);
 db.prepare('INSERT INTO account_mfa VALUES(?,?,?,?)').run(uid,encrypt('TEST-SEED',outboxKey),Date.now(),0);assert.equal(run('grant','operator@example.test').status,0);assert.equal(db.prepare('SELECT count(*) n FROM platform_admins').get().n,1);assert.match(run('list').stdout,/operator@example.test/);
 assert.equal(run('revoke','operator@example.test').status,0);assert.equal(db.prepare('SELECT count(*) n FROM platform_admins').get().n,0);assert.equal(db.prepare("SELECT count(*) n FROM audit WHERE action LIKE 'platform.admin_%'").get().n,2);
});
test('public directory and help search escape stored and reflected HTML',async t=>{
 const h=fixture(t),s=h.user(),c=await h.church(s);await h.listing(c,s,{summary:'<script>alert("stored")</script>'});h.db.prepare('UPDATE churches SET name=? WHERE id=?').run('<img src=x onerror=alert(1)>',c);
 const page=renderPublicPage({path:'/churches/public-church',db:h.db,config:h.config});assert.ok(!page.includes('<script>alert'));assert.ok(!page.includes('<img src=x'));assert.ok(page.includes('&lt;script&gt;'));
 const search=renderPublicPage({path:'/help',query:new URLSearchParams({q:'"><script>alert(1)</script>'}),db:h.db,config:h.config});assert.ok(!search.includes('<script>alert'));
});
test('donation page clearly distinguishes unconfigured and hosted checkout states',t=>{
 const h=fixture(t);assert.match(renderPublicPage({path:'/donate',db:h.db,config:h.config}),/Online donations are not open yet/);
 const page=renderPublicPage({path:'/donate',db:h.db,config:{...h.config,donationUrl:'https://payments.example.test/give',donationLabel:'Test provider'}});assert.match(page,/external checkout/);assert.match(page,/https:\/\/payments.example.test\/give/);
 assert.throws(()=>loadConfig({DONATION_CHECKOUT_URL:'http://unsafe.test'}));assert.throws(()=>loadConfig({DONATION_CHECKOUT_URL:'https://payments.example.test'}));
});
test('HTTP public pages, static assets, native contact fallback and private noindex work',async t=>{
 const h=fixture(t),server=createHttpServer(h.config,h.db);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base=`http://127.0.0.1:${server.address().port}`;
 for(const path of [...PUBLIC_PATHS,'/templates/living-faith','/help/live-services']){const r=await fetch(base+path);assert.equal(r.status,200,path);assert.match(r.headers.get('content-type'),/text\/html/);assert.match(r.headers.get('content-security-policy'),/frame-ancestors 'none'/);}
 const asset=await fetch(base+'/assets/community-hero.webp');assert.equal(asset.status,200);assert.equal(asset.headers.get('content-type'),'image/webp');
 assert.match(await (await fetch(base+'/app')).text(),/noindex/);assert.equal((await fetch(base+'/not-a-page')).status,404);
 const form=await (await fetch(base+'/contact')).text(),nonce=form.match(/name="nonce" type="hidden" value="([^"]+)"/)[1];h.db.prepare('UPDATE public_contact_tokens SET created_at=created_at-2000').run();
 const body=new URLSearchParams({nonce,name:'Native visitor',email:'native@example.test',topic:'general',subject:'Native form',message:'A message sent without JavaScript.',consent:'on',privacyVersion:PRIVACY_VERSION});
 const receipt=await fetch(base+'/contact',{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body});assert.equal(receipt.status,200);assert.match(await receipt.text(),/Your message is with us/);assert.equal(h.db.prepare('SELECT count(*) n FROM public_enquiries').get().n,1);
 assert.equal((await fetch(base+'/contact',{method:'POST',headers:{origin:'https://other.test','content-type':'application/x-www-form-urlencoded'},body})).status,403);
 assert.match(await (await fetch(base+'/sitemap.xml')).text(),/\/templates\/living-faith/);
});
