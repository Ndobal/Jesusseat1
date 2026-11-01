import { audit, transaction } from './db.js';
import { digest, fail, text } from './security.js';
import { PERMISSIONS, requireGlobal } from './permissions.js';

export const roleVersion = role => digest(`${role.name}\0${role.permissions}\0${role.archived_at || ''}`);
export function validPermissions(value, ctx) {
  if (!Array.isArray(value) || !value.length || value.length > PERMISSIONS.length || !value.includes('church.read') || !value.every(p => PERMISSIONS.includes(p) && ctx.permissions.includes(p))) fail(400, 'Choose valid permissions including church.read; you cannot grant access you do not hold.');
  return [...new Set(value)];
}

export function manageRole(db, churchId, userId, ctx, roleId, method, body) {
  requireGlobal(ctx);
  return transaction(db, () => {
    const role = db.prepare('SELECT * FROM roles WHERE id=? AND church_id=? AND archived_at IS NULL').get(roleId, churchId);
    if (!role) fail(404, 'Role not found.');
    if (role.builtin) fail(403, 'Standard roles cannot be edited or archived. Create a custom role instead.');
    if (body.version !== roleVersion(role)) fail(409, 'This role has changed. Reload it before saving.');
    if (!JSON.parse(role.permissions).every(p => ctx.permissions.includes(p))) fail(403, 'This role includes permissions outside your authority.');
    const own = db.prepare('SELECT role_id FROM memberships WHERE church_id=? AND user_id=?').get(churchId, userId);
    if (own.role_id === roleId) fail(403, 'Ask another administrator to change the role you are currently using.');
    const assigned = db.prepare('SELECT count(*) n FROM memberships WHERE church_id=? AND role_id=?').get(churchId, roleId).n;
    const pending = db.prepare('SELECT count(*) n FROM invitations WHERE church_id=? AND role_id=? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>?').get(churchId, roleId, Date.now()).n;
    if (method === 'DELETE') {
      if (assigned || pending) fail(409, 'Reassign members and revoke pending invitations before archiving this role.');
      db.prepare('UPDATE roles SET archived_at=? WHERE id=? AND church_id=?').run(Date.now(), roleId, churchId);
      audit(db, churchId, userId, 'role.archive', roleId, { name: role.name });
      return { message: 'Custom role archived.' };
    }
    const name = text(body.name, 'Role name', 2, 80), permissions = validPermissions(body.permissions, ctx);
    const expanded = permissions.some(p => !JSON.parse(role.permissions).includes(p));
    if (expanded && (assigned || pending) && body.confirmExpansion !== true) fail(409, 'This adds access for existing members or invitees. Review and confirm the expanded permissions.');
    if (db.prepare('SELECT id FROM roles WHERE church_id=? AND name=? AND id<>?').get(churchId, name, roleId)) fail(409, 'A role with this name already exists.');
    db.prepare('UPDATE roles SET name=?,permissions=? WHERE id=? AND church_id=?').run(name, JSON.stringify(permissions), roleId, churchId);
    audit(db, churchId, userId, 'role.update', roleId, {
      previousName: role.name, name, previousPermissions: JSON.parse(role.permissions), permissions,
      affectedMembers: assigned, affectedInvitations: pending, confirmedExpansion: expanded && body.confirmExpansion === true
    });
    return { message: 'Custom role saved.', affectedMembers: assigned, affectedInvitations: pending };
  });
}
