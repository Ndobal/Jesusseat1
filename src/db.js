import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { id } from './security.js';
import { BUILTINS } from './permissions.js';

export function openDatabase(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;');
  transaction(db, () => {
    db.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
    if (!db.prepare('PRAGMA table_info(roles)').all().some(column => column.name === 'archived_at')) db.exec('ALTER TABLE roles ADD COLUMN archived_at INTEGER');
    db.prepare('INSERT OR IGNORE INTO schema_migrations VALUES(2,?)').run(Date.now());
    db.prepare('INSERT OR IGNORE INTO schema_migrations VALUES(3,?)').run(Date.now());
    db.prepare('INSERT OR IGNORE INTO schema_migrations VALUES(4,?)').run(Date.now());
    if (!db.prepare('SELECT version FROM schema_migrations WHERE version=5').get()) {
      for (const church of db.prepare('SELECT id FROM churches').all()) {
        for(const memberRole of db.prepare("SELECT id,permissions FROM roles WHERE church_id=? AND builtin='member'").all(church.id)) {
          if(memberRole.permissions==='[]') continue;
          db.prepare("UPDATE roles SET permissions='[]' WHERE id=? AND church_id=?").run(memberRole.id,church.id);
          audit(db,church.id,null,'role.member_workspace_removed',memberRole.id,{migration:5});
        }
        for (const builtin of ['head_usher','usher','project_coordinator','department_leader']) {
          if (db.prepare('SELECT id FROM roles WHERE church_id=? AND builtin=?').get(church.id,builtin)) continue;
          const role=BUILTINS[builtin];let name=role.name,suffix=0;
          while (db.prepare('SELECT id FROM roles WHERE church_id=? AND name=?').get(church.id,name)) name=`${role.name} (standard ${++suffix})`;
          const roleId=id();
          db.prepare('INSERT INTO roles(id,church_id,name,builtin,permissions) VALUES(?,?,?,?,?)').run(roleId,church.id,name,builtin,JSON.stringify(role.permissions));
          audit(db,church.id,null,'role.bootstrap',roleId,{builtin,migration:5});
        }
      }
      db.prepare('INSERT INTO schema_migrations VALUES(5,?)').run(Date.now());
    }
    db.prepare('INSERT OR IGNORE INTO schema_migrations VALUES(6,?)').run(Date.now());
    if(!db.prepare('SELECT version FROM schema_migrations WHERE version=7').get()) {
      for(const role of db.prepare("SELECT id,church_id,permissions FROM roles WHERE builtin='church_admin'").all()) {
        const permissions=JSON.parse(role.permissions);
        if(!permissions.includes('website.publish')) { permissions.push('website.publish');db.prepare('UPDATE roles SET permissions=? WHERE id=?').run(JSON.stringify(permissions),role.id);audit(db,role.church_id,null,'role.website_publish',role.id,{migration:7}); }
      }
      db.prepare('INSERT INTO schema_migrations VALUES(7,?)').run(Date.now());
    }
    if(!db.prepare('SELECT version FROM schema_migrations WHERE version=8').get()){
      for(const r of db.prepare("SELECT * FROM roles WHERE builtin IN ('church_admin','department_leader')").all()){
        const permissions=JSON.parse(r.permissions);if(!permissions.includes('departments.manage')){permissions.push('departments.manage');db.prepare('UPDATE roles SET permissions=? WHERE id=?').run(JSON.stringify(permissions),r.id);audit(db,r.church_id,null,'role.departments_manage',r.id,{migration:8});}
      }
      db.prepare('INSERT INTO schema_migrations VALUES(8,?)').run(Date.now());
    }
    if(!db.prepare('SELECT version FROM schema_migrations WHERE version=9').get()){
      const additions={church_admin:['attendance.review','care.sensitive','welfare.approve','children.manage','safeguarding.manage'],head_usher:['attendance.review'],pastor:['care.sensitive','welfare.approve','safeguarding.manage']};
      for(const r of db.prepare("SELECT * FROM roles WHERE builtin IN ('church_admin','head_usher','pastor')").all()){
        const permissions=JSON.parse(r.permissions),added=additions[r.builtin].filter(p=>!permissions.includes(p));
        if(added.length){db.prepare('UPDATE roles SET permissions=? WHERE id=?').run(JSON.stringify([...permissions,...added]),r.id);audit(db,r.church_id,null,'role.ministry_permissions',r.id,{migration:9,added});}
      }
      db.prepare('INSERT INTO schema_migrations VALUES(9,?)').run(Date.now());
    }
    db.prepare('INSERT OR IGNORE INTO schema_migrations VALUES(10,?)').run(Date.now());
  });
  return db;
}

// All callbacks must be synchronous: no network calls or awaits inside a transaction.
export function transaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    if (result?.then) throw new Error('Async transaction callbacks are forbidden');
    db.exec('COMMIT');
    return result;
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}

export function audit(db, church, actor, action, target, detail = {}) {
  db.prepare('INSERT INTO audit(church_id,actor_id,action,target,detail,created_at) VALUES(?,?,?,?,?,?)')
    .run(church, actor, action, target, JSON.stringify(detail), Date.now());
}
