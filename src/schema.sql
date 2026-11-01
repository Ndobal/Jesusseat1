CREATE TABLE IF NOT EXISTS users (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
 password_hash TEXT NOT NULL, verified_at INTEGER, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 csrf TEXT NOT NULL, expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS tokens (
 token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind IN ('verify','reset')), expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS churches (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT UNIQUE NOT NULL,
 structure TEXT NOT NULL CHECK(structure IN ('independent','multi_branch','denomination')),
 country TEXT NOT NULL, city TEXT NOT NULL, timezone TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended')),
 contact_email TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '',
 welcome TEXT NOT NULL DEFAULT '', template TEXT NOT NULL DEFAULT 'welcome-home',
 service_times TEXT NOT NULL DEFAULT '', policy_version TEXT NOT NULL,
 accepted_by TEXT NOT NULL REFERENCES users(id), accepted_at INTEGER NOT NULL,
 created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS branches (
 id TEXT PRIMARY KEY, church_id TEXT NOT NULL REFERENCES churches(id),
 parent_id TEXT, name TEXT NOT NULL, label TEXT NOT NULL, location TEXT NOT NULL DEFAULT '',
 UNIQUE(church_id,id), FOREIGN KEY(church_id,parent_id) REFERENCES branches(church_id,id)
);
CREATE INDEX IF NOT EXISTS branch_church ON branches(church_id);
CREATE TABLE IF NOT EXISTS roles (
 id TEXT PRIMARY KEY, church_id TEXT NOT NULL REFERENCES churches(id),
 name TEXT NOT NULL, builtin TEXT, permissions TEXT NOT NULL, archived_at INTEGER,
 UNIQUE(church_id,id), UNIQUE(church_id,name)
);
CREATE TABLE IF NOT EXISTS memberships (
 id TEXT PRIMARY KEY, church_id TEXT NOT NULL REFERENCES churches(id), user_id TEXT NOT NULL REFERENCES users(id),
 role_id TEXT NOT NULL, branch_id TEXT, created_at INTEGER NOT NULL,
 UNIQUE(church_id,user_id),
 FOREIGN KEY(church_id,role_id) REFERENCES roles(church_id,id),
 FOREIGN KEY(church_id,branch_id) REFERENCES branches(church_id,id)
);
CREATE TABLE IF NOT EXISTS invitations (
 id TEXT PRIMARY KEY, church_id TEXT NOT NULL REFERENCES churches(id), email TEXT NOT NULL,
 role_id TEXT NOT NULL, branch_id TEXT, token_hash TEXT UNIQUE NOT NULL,
 invited_by TEXT NOT NULL REFERENCES users(id), expires_at INTEGER NOT NULL,
 accepted_at INTEGER, revoked_at INTEGER, created_at INTEGER NOT NULL,
 FOREIGN KEY(church_id,role_id) REFERENCES roles(church_id,id),
 FOREIGN KEY(church_id,branch_id) REFERENCES branches(church_id,id)
);
CREATE UNIQUE INDEX IF NOT EXISTS one_open_invite ON invitations(church_id,email) WHERE accepted_at IS NULL AND revoked_at IS NULL;
CREATE TABLE IF NOT EXISTS statements (
 id TEXT PRIMARY KEY, church_id TEXT NOT NULL REFERENCES churches(id),
 kind TEXT NOT NULL CHECK(kind IN ('vision','mission')), title TEXT NOT NULL,
 body TEXT NOT NULL, position INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS audit (
 id INTEGER PRIMARY KEY AUTOINCREMENT, church_id TEXT REFERENCES churches(id),
 actor_id TEXT REFERENCES users(id), action TEXT NOT NULL, target TEXT NOT NULL,
 detail TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit BEGIN SELECT RAISE(ABORT,'Audit history is append-only'); END;
CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit BEGIN SELECT RAISE(ABORT,'Audit history is append-only'); END;
CREATE INDEX IF NOT EXISTS audit_church ON audit(church_id,id);
CREATE TABLE IF NOT EXISTS outbox (
 id TEXT PRIMARY KEY, recipient TEXT NOT NULL, subject TEXT NOT NULL, payload TEXT NOT NULL,
 created_at INTEGER NOT NULL, sent_at INTEGER, attempts INTEGER NOT NULL DEFAULT 0,
 next_attempt_at INTEGER NOT NULL DEFAULT 0, lease_until INTEGER NOT NULL DEFAULT 0,
 last_error TEXT
);
CREATE TABLE IF NOT EXISTS rate_limits (
 key TEXT PRIMARY KEY, count INTEGER NOT NULL, reset_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS account_mfa (
 user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 secret_cipher TEXT NOT NULL, enabled_at INTEGER NOT NULL, last_step INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS recovery_codes (
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, code_hash TEXT NOT NULL,
 PRIMARY KEY(user_id,code_hash)
);
CREATE TABLE IF NOT EXISTS mfa_enrollments (
 user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 secret_cipher TEXT NOT NULL, session_hash TEXT NOT NULL, expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS mfa_challenges (
 token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 csrf TEXT NOT NULL, expires_at INTEGER NOT NULL, password_version TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS mfa_challenge_user ON mfa_challenges(user_id);
CREATE TABLE IF NOT EXISTS platform_admins (
 user_id TEXT PRIMARY KEY REFERENCES users(id), granted_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS public_contact_tokens (
 token_hash TEXT PRIMARY KEY, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS public_enquiries (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL, topic TEXT NOT NULL,
 subject TEXT NOT NULL, message_cipher TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'new'
 CHECK(status IN ('new','open','resolved')), privacy_version TEXT NOT NULL,
 consent_at INTEGER NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
 version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS public_enquiry_status ON public_enquiries(status,created_at);
CREATE TABLE IF NOT EXISTS public_enquiry_replies (
 id TEXT PRIMARY KEY, enquiry_id TEXT NOT NULL REFERENCES public_enquiries(id),
 author_id TEXT NOT NULL REFERENCES users(id), body_cipher TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS church_directory (
 church_id TEXT PRIMARY KEY REFERENCES churches(id), summary TEXT NOT NULL DEFAULT '',
 website_url TEXT NOT NULL DEFAULT '', published INTEGER NOT NULL DEFAULT 0 CHECK(published IN (0,1)),
 version INTEGER NOT NULL DEFAULT 1, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS worker_access_suspensions (
 church_id TEXT NOT NULL, user_id TEXT NOT NULL, suspended_at INTEGER NOT NULL,
 initiated_by TEXT NOT NULL REFERENCES users(id),
 PRIMARY KEY(church_id,user_id),
 FOREIGN KEY(church_id,user_id) REFERENCES memberships(church_id,user_id)
);
INSERT OR IGNORE INTO schema_migrations VALUES (1, unixepoch()*1000);
