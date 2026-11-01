import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

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
