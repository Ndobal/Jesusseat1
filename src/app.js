import { id, secret, digest, hashPassword, verifyPassword, encrypt, email, password, text, fail, HttpError, rateLimit } from './security.js';
import { transaction, audit } from './db.js';
import { PERMISSIONS, BUILTINS, context, requireGlobal, branchesInScope, checkBranch } from './permissions.js';

export const POLICY_VERSION='2026-11-01-draft-1';
export const TEMPLATES=['welcome-home','living-faith','grace-heritage','open-doors','the-gathering'];
const HOUR=3600_000, DAY=24*HOUR;
const optional=(v,label,max=200)=>v===undefined || v==='' ? '' : text(v,label,0,max);
function cookieValue(header,name) {
  const value=(header||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(`${name}=`));
  return value?.slice(name.length+1) || '';
}

export function createApp({db,origin,production=false,outboxKey}) {
  if (!outboxKey) throw new Error('An outbox encryption key is required');
  const cookieName=production?'__Host-jesusseat':'jesusseat';
  const dummyHash=hashPassword(secret());
  function queueMail(to,subject,message) {
    db.prepare('INSERT INTO outbox(id,recipient,subject,payload,created_at) VALUES(?,?,?,?,?)')
      .run(id(),to,subject,encrypt(message,outboxKey),Date.now());
  }
  function issueToken(user,kind) {
    const token=secret();
    db.prepare('DELETE FROM tokens WHERE user_id=? AND kind=?').run(user.id,kind);
    db.prepare('INSERT INTO tokens VALUES(?,?,?,?)').run(digest(token),user.id,kind,Date.now()+(kind==='verify'?DAY:HOUR));
    const route=kind==='verify'?'verify':'reset';
    queueMail(user.email,kind==='verify'?'Verify your JesusSeat email':'Reset your JesusSeat password',
      `Hello ${user.name},\n\n${kind==='verify'?'Verify your email':'Reset your password'} using this link:\n${origin}/${route}#token=${token}\n\nThis link expires in ${kind==='verify'?'24 hours':'one hour'} and can only be used once. If you did not request this, ignore this email.\n\nJesusSeat — an evangelical product of Ndovera Limited.`);
  }
  function sessionFor(user) {
    const token=secret(),csrf=secret();
    db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(digest(token),user.id,csrf,Date.now()+12*HOUR);
    db.prepare('DELETE FROM sessions WHERE expires_at<?').run(Date.now());
    return { csrf,cookie:`${cookieName}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=43200${production?'; Secure':''}` };
  }
  function auth(req) {
    const token=cookieValue(req.headers.cookie,cookieName);
    const session=token && db.prepare(`SELECT s.*,u.name,u.email,u.verified_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?`).get(digest(token),Date.now());
    if (!session) fail(401,'Please sign in to continue.');
    if (req.method!=='GET' && req.headers['x-csrf-token']!==session.csrf) fail(403,'Security token expired. Refresh the page and try again.');
    return session;
  }
  function verified(session) { if (!session.verified_at) fail(403,'Verify your email before creating or joining a church.'); }
  function canAssign(ctx,role) {
    if (role.builtin==='church_admin' && (ctx.builtin!=='church_admin'||ctx.branch_id)) fail(403,'Only a church-wide administrator can assign administrators.');
    if (!JSON.parse(role.permissions).every(p=>ctx.permissions.includes(p))) fail(403,'You cannot grant permissions you do not hold.');
  }
  function roleFor(churchId,roleId) {
    if(typeof roleId!=='string'||!/^[a-f0-9]{32}$/.test(roleId))fail(400,'Choose a valid church role.');
    return db.prepare('SELECT * FROM roles WHERE church_id=? AND id=?').get(churchId,roleId) || fail(400,'Choose a role from this church.');
  }
  function onboarding(churchId) {
    const c=db.prepare('SELECT * FROM churches WHERE id=?').get(churchId);
    return [
      {key:'profile',label:'Complete your church profile',done:!!(c.name&&c.country&&c.city&&c.contact_email),href:'profile'},
      {key:'structure',label:'Confirm your church structure',done:c.structure==='independent'||db.prepare('SELECT count(*) n FROM branches WHERE church_id=?').get(churchId).n>1,href:'branches'},
      {key:'website',label:'Choose a template and welcome message',done:!!c.welcome,href:'profile'},
      {key:'purpose',label:'Add a vision and a mission',done:db.prepare('SELECT count(DISTINCT kind) n FROM statements WHERE church_id=?').get(churchId).n===2,href:'purpose'},
      {key:'services',label:'Set your service times',done:!!c.service_times,href:'profile'},
      {key:'team',label:'Invite your ministry team',done:!!db.prepare('SELECT id FROM invitations WHERE church_id=? AND revoked_at IS NULL LIMIT 1').get(churchId)||db.prepare('SELECT count(*) n FROM memberships WHERE church_id=?').get(churchId).n>1,href:'team'}
    ];
  }
  return async function dispatch(req) {
    try {
      const {method,path,body={},headers={},ip='unknown'}=req;
      req.headers=headers;
      if (method!=='GET') {
        if (headers.origin!==origin) fail(403,'Request origin is not allowed.');
        rateLimit(db,`write:${digest(ip)}`,250);
      }
      if (method==='GET' && path==='/api/health') return {status:200,data:{status:'ok',version:'0.2.0'}};
      if (method==='GET' && path==='/api/config') return {data:{policyVersion:POLICY_VERSION,templates:TEMPLATES,permissions:PERMISSIONS,operator:'Ndovera Limited'}};
      if (method==='POST' && path==='/api/auth/register') {
        rateLimit(db,`register:${digest(ip)}`,8,HOUR);
        const address=email(body.email),name=text(body.name,'Name',2,100),hash=await hashPassword(password(body.password));
        transaction(db,()=>{
          // Deliberately identical response for existing and new email addresses.
          if (db.prepare('SELECT id FROM users WHERE email=?').get(address)) return;
          const user={id:id(),email:address,name};
          db.prepare('INSERT INTO users(id,name,email,password_hash,created_at) VALUES(?,?,?,?,?)').run(user.id,name,address,hash,Date.now());
          issueToken(user,'verify'); audit(db,null,user.id,'account.register',user.id);
        });
        return {status:202,data:{message:'If this address is new, a verification email has been queued. You can sign in to check your account.'}};
      }
      if (method==='POST' && path==='/api/auth/login') {
        const address=email(body.email);
        rateLimit(db,`login-ip:${digest(ip)}`,30);
        rateLimit(db,`login-email:${digest(address)}`,10);
        if(typeof body.password!=='string'||!body.password.length||Buffer.byteLength(body.password)>256)fail(400,'Enter your password (maximum 256 bytes).');
        const pass=body.password,user=db.prepare('SELECT * FROM users WHERE email=?').get(address);
        const matches=await verifyPassword(pass,user?.password_hash||await dummyHash);
        if (!user||!matches) fail(401,'Email or password is incorrect.');
        const s=transaction(db,()=>{ audit(db,null,user.id,'account.login',user.id); return sessionFor(user); });
        return {data:{csrf:s.csrf},cookie:s.cookie};
      }
      if (method==='POST' && path==='/api/auth/forgot') {
        const address=email(body.email); rateLimit(db,`forgot:${digest(ip)}`,8,HOUR);
        rateLimit(db,`forgot-mail:${digest(address)}`,3,HOUR);
        transaction(db,()=>{const user=db.prepare('SELECT * FROM users WHERE email=?').get(address); if(user) issueToken(user,'reset');});
        return {status:202,data:{message:'If the account exists, a password-reset email has been queued.'}};
      }
      if (method==='POST' && path==='/api/auth/verify') {
        rateLimit(db,`verify:${digest(ip)}`,20);
        const token=text(body.token,'Verification token',30,100);
        transaction(db,()=>{
          const t=db.prepare("SELECT * FROM tokens WHERE token_hash=? AND kind='verify' AND expires_at>?").get(digest(token),Date.now());
          if(!t) fail(400,'This verification link has expired or has already been used.');
          db.prepare('UPDATE users SET verified_at=? WHERE id=?').run(Date.now(),t.user_id);
          db.prepare('DELETE FROM tokens WHERE token_hash=?').run(t.token_hash);
          audit(db,null,t.user_id,'account.verify',t.user_id);
        });
        return {data:{message:'Email verified. Sign in to set up your church.'}};
      }
      if (method==='POST' && path==='/api/auth/reset') {
        rateLimit(db,`reset:${digest(ip)}`,10);
        const token=text(body.token,'Reset token',30,100),hash=await hashPassword(password(body.password));
        transaction(db,()=>{
          const t=db.prepare("SELECT * FROM tokens WHERE token_hash=? AND kind='reset' AND expires_at>?").get(digest(token),Date.now());
          if(!t) fail(400,'This reset link has expired or has already been used.');
          db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hash,t.user_id);
          db.prepare('DELETE FROM tokens WHERE user_id=? AND kind=\'reset\'').run(t.user_id);
          db.prepare('DELETE FROM sessions WHERE user_id=?').run(t.user_id);
          audit(db,null,t.user_id,'account.password_reset',t.user_id);
        });
        return {data:{message:'Password updated. Please sign in again.'}};
      }
      const s=auth(req),userId=s.user_id;
      if(method==='GET' && path==='/api/me') {
        const churches=db.prepare(`SELECT c.id,c.name,c.slug,c.status,r.name role,m.branch_id FROM churches c JOIN memberships m ON m.church_id=c.id JOIN roles r ON r.id=m.role_id WHERE m.user_id=? ORDER BY c.name`).all(userId);
        return {data:{user:{id:userId,name:s.name,email:s.email,verified:!!s.verified_at},csrf:s.csrf,churches}};
      }
      if(method==='POST' && path==='/api/auth/logout') {
        db.prepare('DELETE FROM sessions WHERE token_hash=?').run(s.token_hash);
        return {data:{message:'Signed out.'},cookie:`${cookieName}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${production?'; Secure':''}`};
      }
      if(method==='POST' && path==='/api/auth/resend') {
        rateLimit(db,`resend:${userId}`,3,HOUR);
        if(!s.verified_at) transaction(db,()=>issueToken({id:userId,email:s.email,name:s.name},'verify'));
        return {status:202,data:{message:'If needed, a new verification email has been queued.'}};
      }
      verified(s);
      if(method==='POST' && path==='/api/churches') {
        rateLimit(db,`create-church:${userId}`,5,DAY);
        const name=text(body.name,'Church name',2,160),slug=text(body.slug,'Web address',3,60).toLowerCase();
        if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)||['www','api','admin','app','support','jesusseat'].includes(slug)) fail(400,'Choose another address using lowercase letters, numbers and single hyphens.');
        if(!['independent','multi_branch','denomination'].includes(body.structure)) fail(400,'Choose your church structure.');
        const country=text(body.country,'Country',2,80),city=text(body.city,'City',2,100),timezone=text(body.timezone,'Timezone',2,80);
        try { new Intl.DateTimeFormat('en',{timeZone:timezone}).format(); } catch { fail(400,'Choose a valid IANA timezone, for example Africa/Lagos.'); }
        if(body.acceptPolicy!==true || body.policyVersion!==POLICY_VERSION) fail(400,'Read and accept the current participation terms and statement of faith.');
        const churchId=id();
        transaction(db,()=>{
          if(db.prepare('SELECT id FROM churches WHERE slug=?').get(slug)) fail(409,'That church address is already in use.');
          db.prepare(`INSERT INTO churches(id,name,slug,structure,country,city,timezone,contact_email,policy_version,accepted_by,accepted_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
            .run(churchId,name,slug,body.structure,country,city,timezone,s.email,POLICY_VERSION,userId,Date.now(),Date.now());
          let admin;
          for(const [builtin,role] of Object.entries(BUILTINS)) {
            const roleId=id(); if(builtin==='church_admin')admin=roleId;
            db.prepare('INSERT INTO roles VALUES(?,?,?,?,?)').run(roleId,churchId,role.name,builtin,JSON.stringify(role.permissions));
          }
          db.prepare('INSERT INTO memberships VALUES(?,?,?,?,?,?)').run(id(),churchId,userId,admin,null,Date.now());
          db.prepare('INSERT INTO branches VALUES(?,?,?,?,?,?)').run(id(),churchId,null,name,body.structure==='independent'?'Church':'Headquarters',city);
          audit(db,churchId,userId,'church.create',churchId,{structure:body.structure,policyVersion:POLICY_VERSION});
        });
        return {status:201,data:{id:churchId}};
      }
      if(method==='POST' && path==='/api/invitations/accept') {
        const token=text(body.token,'Invitation token',30,100);
        let churchId;
        transaction(db,()=>{
          const inv=db.prepare('SELECT i.* FROM invitations i JOIN churches c ON c.id=i.church_id WHERE i.token_hash=? AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at>? AND c.status=\'active\'').get(digest(token),Date.now());
          if(!inv) fail(400,'This invitation is unavailable, expired or already accepted.');
          if(inv.email!==s.email) fail(403,'Sign in with the email address this invitation was sent to.');
          if(db.prepare('SELECT id FROM memberships WHERE church_id=? AND user_id=?').get(inv.church_id,userId)) fail(409,'You already belong to this church.');
          db.prepare('INSERT INTO memberships VALUES(?,?,?,?,?,?)').run(id(),inv.church_id,userId,inv.role_id,inv.branch_id,Date.now());
          db.prepare('UPDATE invitations SET accepted_at=? WHERE id=?').run(Date.now(),inv.id);
          audit(db,inv.church_id,userId,'invitation.accept',inv.id); churchId=inv.church_id;
        });
        return {data:{churchId}};
      }
      const match=path.match(/^\/api\/churches\/([a-f0-9]{32})(?:\/(.*))?$/);
      if(!match) fail(404,'Endpoint not found.');
      const churchId=match[1],tail=match[2]||'';
      const ctx=context(db,churchId,userId);
      if(method==='GET' && !tail) {
        const c=db.prepare('SELECT * FROM churches WHERE id=?').get(churchId);
        return {data:{church:c,permissions:ctx.permissions,scope:ctx.branch_id,onboarding:ctx.branch_id?[]:onboarding(churchId),branches:branchesInScope(db,churchId,ctx)}};
      }
      if(method==='PATCH' && !tail) {
        context(db,churchId,userId,'church.manage'); requireGlobal(ctx);
        const c=db.prepare('SELECT * FROM churches WHERE id=?').get(churchId);
        const update={name:body.name===undefined?c.name:text(body.name,'Church name',2,160),contact_email:body.contact_email===undefined?c.contact_email:email(body.contact_email),phone:body.phone===undefined?c.phone:optional(body.phone,'Phone',50),welcome:body.welcome===undefined?c.welcome:optional(body.welcome,'Welcome message',2000),service_times:body.service_times===undefined?c.service_times:optional(body.service_times,'Service times',1000),template:body.template??c.template};
        if(!TEMPLATES.includes(update.template)) fail(400,'Choose a supported template.');
        transaction(db,()=>{
          db.prepare('UPDATE churches SET name=?,contact_email=?,phone=?,welcome=?,service_times=?,template=? WHERE id=?')
            .run(update.name,update.contact_email,update.phone,update.welcome,update.service_times,update.template,churchId);
          audit(db,churchId,userId,'church.update',churchId,{fields:Object.keys(update)});
        }); return {data:{message:'Church profile saved.'}};
      }
      if(method==='POST' && tail==='branches') {
        context(db,churchId,userId,'branches.manage');
        const name=text(body.name,'Branch name',2,160),label=text(body.label,'Branch label',2,50),location=optional(body.location,'Location',200);
        const parent=body.parent_id||null; checkBranch(db,churchId,ctx,parent);
        if(db.prepare('SELECT structure FROM churches WHERE id=?').get(churchId).structure==='independent') fail(400,'Independent churches use their existing church location.');
        const branchId=id();transaction(db,()=>{
          db.prepare('INSERT INTO branches VALUES(?,?,?,?,?,?)').run(branchId,churchId,parent,name,label,location);
          audit(db,churchId,userId,'branch.create',branchId,{parent});
        });return {status:201,data:{id:branchId}};
      }
      if(method==='GET' && tail==='roles') {
        context(db,churchId,userId,'team.read');
        return {data:{roles:db.prepare('SELECT * FROM roles WHERE church_id=? ORDER BY name').all(churchId).map(r=>({...r,permissions:JSON.parse(r.permissions)}))}};
      }
      if(method==='POST' && tail==='roles') {
        context(db,churchId,userId,'roles.manage');requireGlobal(ctx);
        const name=text(body.name,'Role name',2,80),perms=body.permissions;
        if(!Array.isArray(perms)||!perms.length||perms.length>PERMISSIONS.length||!perms.every(p=>PERMISSIONS.includes(p)&&ctx.permissions.includes(p))||!perms.includes('church.read')) fail(400,'Choose valid permissions including church.read.');
        const roleId=id();transaction(db,()=>{
          if(db.prepare('SELECT id FROM roles WHERE church_id=? AND name=?').get(churchId,name))fail(409,'A role with this name already exists.');
          db.prepare('INSERT INTO roles VALUES(?,?,?,?,?)').run(roleId,churchId,name,null,JSON.stringify([...new Set(perms)]));
          audit(db,churchId,userId,'role.create',roleId,{name,permissions:perms});
        });return {status:201,data:{id:roleId}};
      }
      if(method==='GET' && tail==='team') {
        context(db,churchId,userId,'team.read');
        const scoped=new Set(branchesInScope(db,churchId,ctx).map(b=>b.id));
        const members=db.prepare(`SELECT m.id,m.user_id,m.role_id,m.branch_id,u.name,u.email,r.name role,r.builtin FROM memberships m JOIN users u ON u.id=m.user_id JOIN roles r ON r.id=m.role_id WHERE m.church_id=? ORDER BY u.name`).all(churchId).filter(m=>!ctx.branch_id||scoped.has(m.branch_id));
        const invitations=ctx.permissions.includes('team.manage')?db.prepare('SELECT id,email,role_id,branch_id,expires_at,accepted_at,revoked_at FROM invitations WHERE church_id=? ORDER BY created_at DESC LIMIT 100').all(churchId).filter(m=>!ctx.branch_id||scoped.has(m.branch_id)):[];
        return {data:{members,invitations}};
      }
      if(method==='POST' && tail==='invitations') {
        context(db,churchId,userId,'team.manage');
        const address=email(body.email),role=roleFor(churchId,body.role_id),branchId=body.branch_id||null;
        checkBranch(db,churchId,ctx,branchId);canAssign(ctx,role);
        if(role.builtin==='church_admin'&&branchId)fail(400,'Use a custom scoped role for branch administrators.');
        const token=secret(),invId=id();
        transaction(db,()=>{
          if(db.prepare('SELECT m.id FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.church_id=? AND u.email=?').get(churchId,address)) fail(409,'This person already belongs to the church.');
          db.prepare('UPDATE invitations SET revoked_at=? WHERE church_id=? AND email=? AND accepted_at IS NULL AND revoked_at IS NULL').run(Date.now(),churchId,address);
          db.prepare('INSERT INTO invitations(id,church_id,email,role_id,branch_id,token_hash,invited_by,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run(invId,churchId,address,role.id,branchId,digest(token),userId,Date.now()+7*DAY,Date.now());
          const c=db.prepare('SELECT name FROM churches WHERE id=?').get(churchId);
          queueMail(address,`You are invited to ${c.name} on JesusSeat`,`${s.name} invited you to ${c.name} as ${role.name}.\n\nSign in or create and verify an account with ${address}, then open:\n${origin}/invite#token=${token}\n\nThis invitation expires in 7 days.\nJesusSeat — Ndovera Limited.`);
          audit(db,churchId,userId,'invitation.create',invId,{role:role.id,branch:branchId});
        });return {status:201,data:{message:'Invitation queued for delivery.'}};
      }
      const revoke=tail.match(/^invitations\/([a-f0-9]{32})$/);
      if(method==='DELETE'&&revoke) {
        context(db,churchId,userId,'team.manage');
        transaction(db,()=>{
          const inv=db.prepare('SELECT * FROM invitations WHERE id=? AND church_id=? AND accepted_at IS NULL AND revoked_at IS NULL').get(revoke[1],churchId);
          if(!inv)fail(404,'Invitation not found.');checkBranch(db,churchId,ctx,inv.branch_id);canAssign(ctx,roleFor(churchId,inv.role_id));
          db.prepare('UPDATE invitations SET revoked_at=? WHERE id=?').run(Date.now(),inv.id);
          audit(db,churchId,userId,'invitation.revoke',inv.id);
        });return {data:{message:'Invitation revoked.'}};
      }
      const member=tail.match(/^team\/([a-f0-9]{32})$/);
      if((method==='PATCH'||method==='DELETE')&&member) {
        context(db,churchId,userId,'team.manage');
        transaction(db,()=>{
          const m=db.prepare('SELECT m.*,r.builtin FROM memberships m JOIN roles r ON r.id=m.role_id WHERE m.church_id=? AND m.id=?').get(churchId,member[1]);
          if(!m)fail(404,'Team member not found.');
          if(m.user_id===userId)fail(400,'Ask another administrator to change or remove your access.');
          checkBranch(db,churchId,ctx,m.branch_id);canAssign(ctx,roleFor(churchId,m.role_id));
          let role,branch;
          if(method==='PATCH') {
            role=roleFor(churchId,body.role_id);branch=body.branch_id||null;checkBranch(db,churchId,ctx,branch);canAssign(ctx,role);
            if(role.builtin==='church_admin'&&branch)fail(400,'Church administrators require church-wide scope.');
          }
          if(m.builtin==='church_admin'&&(method==='DELETE'||role.builtin!=='church_admin')&&db.prepare(`SELECT count(*) n FROM memberships m JOIN roles r ON r.id=m.role_id WHERE m.church_id=? AND r.builtin='church_admin' AND m.branch_id IS NULL`).get(churchId).n<=1) fail(409,'Keep at least one church administrator.');
          if(method==='DELETE')db.prepare('DELETE FROM memberships WHERE id=?').run(m.id);
          else db.prepare('UPDATE memberships SET role_id=?,branch_id=? WHERE id=?').run(role.id,branch,m.id);
          audit(db,churchId,userId,method==='DELETE'?'membership.remove':'membership.update',m.id,{role:role?.id,branch});
        });return {data:{message:'Team access updated.'}};
      }
      if(method==='GET'&&tail==='statements')return {data:{statements:db.prepare('SELECT * FROM statements WHERE church_id=? ORDER BY kind,position,title').all(churchId)}};
      if(method==='POST'&&tail==='statements') {
        context(db,churchId,userId,'church.manage');requireGlobal(ctx);
        if(!['vision','mission'].includes(body.kind))fail(400,'Choose vision or mission.');
        const title=text(body.title,'Title',2,160),content=text(body.body,'Statement',5,5000),statementId=id();
        transaction(db,()=>{
          db.prepare('INSERT INTO statements VALUES(?,?,?,?,?,?)').run(statementId,churchId,body.kind,title,content,0);
          audit(db,churchId,userId,'statement.create',statementId,{kind:body.kind});
        });return {status:201,data:{id:statementId}};
      }
      const statement=tail.match(/^statements\/([a-f0-9]{32})$/);
      if(statement&&(method==='PATCH'||method==='DELETE')) {
        context(db,churchId,userId,'church.manage');requireGlobal(ctx);
        transaction(db,()=>{
          if(!db.prepare('SELECT id FROM statements WHERE id=? AND church_id=?').get(statement[1],churchId))fail(404,'Statement not found.');
          if(method==='DELETE')db.prepare('DELETE FROM statements WHERE id=? AND church_id=?').run(statement[1],churchId);
          else {
            const position=body.position??0;if(!Number.isInteger(position)||position<0||position>10000)fail(400,'Invalid display order.');
            db.prepare('UPDATE statements SET title=?,body=?,position=? WHERE id=? AND church_id=?').run(text(body.title,'Title',2,160),text(body.body,'Statement',5,5000),position,statement[1],churchId);
          }
          audit(db,churchId,userId,method==='DELETE'?'statement.delete':'statement.update',statement[1]);
        });return {data:{message:'Statement updated.'}};
      }
      if(method==='GET'&&tail==='audit') {
        context(db,churchId,userId,'audit.read');requireGlobal(ctx);
        const before=Number(req.query?.get('before')||Number.MAX_SAFE_INTEGER);
        if(!Number.isSafeInteger(before)||before<1)fail(400,'Invalid audit cursor.');
        return {data:{events:db.prepare(`SELECT a.id,a.action,a.target,a.detail,a.created_at,u.name actor FROM audit a LEFT JOIN users u ON u.id=a.actor_id WHERE a.church_id=? AND a.id<? ORDER BY a.id DESC LIMIT 50`).all(churchId,before)}};
      }
      fail(404,'Endpoint not found.');
    } catch(error) {
      if(error instanceof HttpError)return {status:error.status,data:{error:error.message}};
      // Do not expose SQL, credentials, request bodies or provider responses.
      return {status:500,data:{error:'Something went wrong. Please try again.'}};
    }
  };
}
