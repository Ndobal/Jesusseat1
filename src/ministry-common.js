import { context, checkBranch } from './permissions.js';
import { fail, text, encrypt, decrypt } from './security.js';
export function version(row,body){if(!Number.isSafeInteger(body.version)||row.version!==body.version)fail(409,'This record changed. Refresh before continuing.');}
export function instant(v){if(typeof v!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,3})?)?(?:Z|[+-]\d\d:\d\d)$/.test(v)||!Number.isFinite(Date.parse(v)))fail(400,'Enter a valid date and time with timezone.');const calendar=v.slice(0,10);if(new Date(calendar).toISOString().slice(0,10)!==calendar)fail(400,'Choose a real calendar date.');return new Date(v).toISOString();}
export function times(b){const start=instant(b.starts_at),end=instant(b.ends_at);if(end<=start||Date.parse(end)-Date.parse(start)>86400000)fail(400,'End time must follow start time within 24 hours.');return [start,end];}
export function number(v,label,max=100000){if(!Number.isSafeInteger(v)||v<0||v>max)fail(400,`Enter a whole ${label} between 0 and ${max}.`);return v;}
export const optional=(v,label,max=2000)=>text(v??'',label,0,max);
export function scope(db,cid,uid,permission,branch){const ctx=context(db,cid,uid,permission);checkBranch(db,cid,ctx,branch);return ctx;}
export function worker(db,cid,uid,permission,branch){if(typeof uid!=='string')fail(400,'Choose an authorised worker.');try{return scope(db,cid,uid,permission,branch);}catch{fail(400,'Choose an active authorised worker in this branch.');}}
export function person(db,cid,pid,branch){const p=db.prepare("SELECT * FROM registry_people WHERE church_id=? AND id=? AND status='active'").get(cid,pid);if(!p||p.branch_id!==branch)fail(400,'Choose an active registry person in this exact branch.');return p;}
export function history(db,key,cid,uid,kind,target,payload){db.prepare('INSERT INTO ministry_events(church_id,kind,target,actor_id,payload,created_at) VALUES(?,?,?,?,?,?)').run(cid,kind,target,uid,encrypt(JSON.stringify(payload),key),Date.now());}
export function events(db,key,cid,target){return db.prepare('SELECT e.*,u.name actor_name FROM ministry_events e JOIN users u ON u.id=e.actor_id WHERE e.church_id=? AND e.target=? ORDER BY e.id').all(cid,target).map(e=>({...e,payload:JSON.parse(decrypt(e.payload,key))}));}
export function workers(db,cid,ctx,permission){return db.prepare('SELECT u.id,u.name,m.branch_id FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.church_id=? ORDER BY u.name').all(cid).filter(u=>{try{const c=context(db,cid,u.id,permission);checkBranch(db,cid,ctx,u.branch_id);return !!c;}catch{return false;}});}
