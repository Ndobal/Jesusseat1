import { fail } from './security.js';
export const PERMISSIONS = ['church.read','church.manage','branches.manage','team.read','team.manage','roles.manage','audit.read','website.manage','media.manage','members.manage','attendance.manage','groups.manage','care.manage','finance.manage'];
export const BUILTINS = {
  church_admin: { name:'Church administrator', permissions:PERMISSIONS },
  pastor: { name:'Pastor', permissions:['church.read','team.read','groups.manage','care.manage'] },
  secretary: { name:'Secretary', permissions:['church.read','team.read','members.manage','attendance.manage','groups.manage'] },
  media: { name:'Media team', permissions:['church.read','website.manage','media.manage'] },
  treasurer: { name:'Treasurer', permissions:['church.read','finance.manage'] },
  attendance: { name:'Attendance officer', permissions:['church.read','attendance.manage'] },
  head_usher: { name:'Head usher', permissions:['church.read','attendance.manage'] },
  usher: { name:'Usher', permissions:['church.read','attendance.manage'] },
  project_coordinator: { name:'Project coordinator', permissions:['church.read'] },
  department_leader: { name:'Department leader', permissions:['church.read'] },
  member: { name:'Member', permissions:[] }
};
export function context(db, churchId, userId, permission = 'church.read') {
  const row = db.prepare(`SELECT m.*, r.permissions,r.builtin,c.status FROM memberships m
    JOIN roles r ON r.id=m.role_id AND r.church_id=m.church_id JOIN churches c ON c.id=m.church_id
    WHERE m.church_id=? AND m.user_id=? AND r.archived_at IS NULL`).get(churchId,userId);
  if (!row) fail(404,'Church workspace not found.');
  if (row.status !== 'active') fail(403,'This church workspace is suspended.');
  if (db.prepare('SELECT user_id FROM worker_access_suspensions WHERE church_id=? AND user_id=?').get(churchId,userId)) fail(403,'Your worker dashboard is suspended for this church.');
  if (row.builtin === 'member') fail(403,'A worker role is required to open this church workspace.');
  row.permissions = JSON.parse(row.permissions);
  if (!row.permissions.includes(permission)) fail(403,'You do not have permission for this action.');
  return row;
}
export function requireGlobal(ctx) { if (ctx.branch_id) fail(403,'This action requires church-wide access.'); }
export function branchesInScope(db, churchId, ctx) {
  if (!ctx.branch_id) return db.prepare('SELECT * FROM branches WHERE church_id=? ORDER BY name').all(churchId);
  return db.prepare(`WITH RECURSIVE scope AS (
    SELECT * FROM branches WHERE church_id=? AND id=? UNION ALL
    SELECT b.* FROM branches b JOIN scope s ON b.parent_id=s.id WHERE b.church_id=?
  ) SELECT * FROM scope ORDER BY name`).all(churchId,ctx.branch_id,churchId);
}
export function checkBranch(db, churchId, ctx, branchId) {
  if (!branchId) { requireGlobal(ctx); return; }
  if (!branchesInScope(db,churchId,ctx).some(b => b.id===branchId)) fail(403,'Branch is outside your permitted scope.');
}
