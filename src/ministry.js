import { createAttendance } from './attendance.js';
import { createGroups } from './ministry-groups.js';
import { createCare } from './ministry-care.js';
import { createChildren } from './ministry-children.js';
import { fail } from './security.js';
export function createMinistry(config){
 const attendance=createAttendance(config),groups=createGroups(config),care=createCare(config),children=createChildren(config);
 return function route(cid,s,tail,method,b,q){
  if(!tail.startsWith('ministry/'))return null;
  const path=tail.slice(9),reply=data=>({data}),created=data=>({status:201,data});
  if(path==='services'){if(method==='GET')return reply(attendance.list(cid,s,q));if(method==='POST')return created(attendance.create(cid,s,b));}
  if(path==='attendance-trends'&&method==='GET')return reply(attendance.trends(cid,s));
  const service=path.match(/^services\/([a-f0-9]{32})(?:\/slots\/([a-f0-9]{32})(?:\/(report|review))?)?$/);
  if(service){const [,sid,slot,action]=service;if(!slot&&method==='GET')return reply(attendance.detail(cid,s.user_id,sid));if(!slot&&method==='PATCH')return reply(attendance.transition(cid,s,sid,b));if(slot&&!action&&method==='PATCH')return reply(attendance.reassign(cid,s,sid,slot,b));if(action==='report'&&method==='POST')return created(attendance.submit(cid,s,sid,slot,b));if(action==='review'&&method==='POST')return reply(attendance.review(cid,s,sid,slot,b));}
  if(path==='groups'){if(method==='GET')return reply(groups.list(cid,s));if(method==='POST')return created(groups.save(cid,s,b));}
  const group=path.match(/^groups\/([a-f0-9]{32})(?:\/(members|meetings|candidates|absences|followups)(?:\/([a-f0-9]{32}))?)?$/);
  if(group){const [,gid,action,mid]=group;if(!action&&method==='GET')return reply(groups.detail(cid,s,gid));if(!action&&method==='PATCH')return reply(groups.save(cid,s,b,gid));if(action==='members'&&method==='POST')return reply(groups.member(cid,s,gid,b));if(action==='meetings'&&(method==='POST'||method==='PATCH'))return created(groups.meeting(cid,s,gid,b,mid));if(action==='candidates'&&method==='GET')return reply(groups.candidates(cid,s,gid,q));if(action==='absences'&&method==='GET')return reply(groups.absences(cid,s,gid));if(action==='followups'&&method==='POST')return created(groups.followup(cid,s,gid,b));}
  if(path==='care-options'&&method==='GET')return reply(care.options(cid,s));
  if(path==='care'){if(method==='GET')return reply(care.list(cid,s,q));if(method==='POST')return created(care.create(cid,s,b));}
  const caseRoute=path.match(/^care\/([a-f0-9]{32})$/);if(caseRoute){if(method==='GET')return reply(care.detail(cid,s,caseRoute[1]));if(method==='PATCH')return reply(care.update(cid,s,caseRoute[1],b));}
  if(path==='children'&&method==='GET')return reply(children.list(cid,s,q));
  if(path==='children/search'&&method==='GET')return reply(children.search(cid,s,q));
  const child=path.match(/^children\/([a-f0-9]{32})(?:\/guardians(?:\/([a-f0-9]{32}))?)?$/);
  if(child){if(!path.includes('/guardians')&&method==='GET')return reply(children.detail(cid,s,child[1]));if(path.includes('/guardians')&&(method==='POST'||method==='PATCH'))return created(children.guardian(cid,s,child[1],b,child[2]));}
  if(path==='checkins'&&method==='POST')return created(children.enter(cid,s,b));
  const checkin=path.match(/^checkins\/([a-f0-9]{32})\/(collect|reissue)$/);if(checkin&&method==='POST')return reply(children[checkin[2]](cid,s,checkin[1],b));
  fail(404,'Ministry endpoint not found.');
 };
}
