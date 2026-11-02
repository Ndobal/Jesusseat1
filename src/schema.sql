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
CREATE TABLE IF NOT EXISTS website_drafts (
 church_id TEXT PRIMARY KEY REFERENCES churches(id), version INTEGER NOT NULL,
 snapshot TEXT NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS website_revisions (
 church_id TEXT NOT NULL REFERENCES churches(id), version INTEGER NOT NULL,
 snapshot TEXT NOT NULL, created_by TEXT NOT NULL REFERENCES users(id), created_at INTEGER NOT NULL,
 PRIMARY KEY(church_id,version)
);
CREATE TRIGGER IF NOT EXISTS website_revision_no_update BEFORE UPDATE ON website_revisions BEGIN SELECT RAISE(ABORT,'Revisions are append-only'); END;
CREATE TRIGGER IF NOT EXISTS website_revision_no_delete BEFORE DELETE ON website_revisions BEGIN SELECT RAISE(ABORT,'Revisions are append-only'); END;
CREATE TABLE IF NOT EXISTS website_publications (
 church_id TEXT PRIMARY KEY REFERENCES churches(id), version INTEGER NOT NULL,
 snapshot TEXT NOT NULL, published_by TEXT NOT NULL REFERENCES users(id), published_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS website_assets (
 id TEXT PRIMARY KEY, church_id TEXT NOT NULL REFERENCES churches(id), name TEXT NOT NULL,
 mime TEXT NOT NULL, data BLOB NOT NULL, size INTEGER NOT NULL, width INTEGER NOT NULL, height INTEGER NOT NULL,
 created_by TEXT NOT NULL REFERENCES users(id), created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS website_assets_church ON website_assets(church_id);
CREATE TABLE IF NOT EXISTS website_form_tokens (
 token_hash TEXT PRIMARY KEY, church_id TEXT NOT NULL REFERENCES churches(id),
 created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS website_messages (
 id TEXT PRIMARY KEY, church_id TEXT NOT NULL REFERENCES churches(id), page_slug TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('contact','comment')), name TEXT NOT NULL, email TEXT NOT NULL,
 message_cipher TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','resolved')),
 consent_version TEXT NOT NULL, created_at INTEGER NOT NULL, version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS website_messages_church ON website_messages(church_id,status,created_at);
CREATE TABLE IF NOT EXISTS registry_settings (
 church_id TEXT PRIMARY KEY REFERENCES churches(id), enabled INTEGER NOT NULL DEFAULT 0,
 default_branch_id TEXT, leap_day TEXT NOT NULL DEFAULT 'feb28', version INTEGER NOT NULL DEFAULT 1,
 FOREIGN KEY(church_id,default_branch_id) REFERENCES branches(church_id,id)
);
CREATE TABLE IF NOT EXISTS registry_households (
 id TEXT PRIMARY KEY, church_id TEXT NOT NULL REFERENCES churches(id), branch_id TEXT,
 name TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL,
 UNIQUE(church_id,id), FOREIGN KEY(church_id,branch_id) REFERENCES branches(church_id,id)
);
CREATE TABLE IF NOT EXISTS registry_people (
 id TEXT PRIMARY KEY, church_id TEXT NOT NULL REFERENCES churches(id), branch_id TEXT,
 name TEXT NOT NULL, name_key TEXT NOT NULL, email TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '',
 birth_day INTEGER, birth_month INTEGER, kind TEXT NOT NULL CHECK(kind IN ('member','visitor')),
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','left','merged')),
 household_id TEXT, household_role TEXT NOT NULL DEFAULT '', user_id TEXT REFERENCES users(id),
 email_verified_at INTEGER, email_birthday INTEGER NOT NULL DEFAULT 0, whatsapp_birthday INTEGER NOT NULL DEFAULT 0,
 sms_birthday INTEGER NOT NULL DEFAULT 0, birthday_share INTEGER NOT NULL DEFAULT 0,
 consent_version TEXT NOT NULL, consent_source TEXT NOT NULL, consent_at INTEGER NOT NULL,
 duplicate_reason_cipher TEXT, merged_into TEXT, version INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
 UNIQUE(church_id,id), FOREIGN KEY(church_id,branch_id) REFERENCES branches(church_id,id),
 FOREIGN KEY(church_id,household_id) REFERENCES registry_households(church_id,id),
 FOREIGN KEY(church_id,merged_into) REFERENCES registry_people(church_id,id),
 CHECK((birth_day IS NULL AND birth_month IS NULL) OR (birth_day IS NOT NULL AND birth_month IS NOT NULL AND birth_month BETWEEN 1 AND 12 AND birth_day BETWEEN 1 AND CASE birth_month WHEN 2 THEN 29 WHEN 4 THEN 30 WHEN 6 THEN 30 WHEN 9 THEN 30 WHEN 11 THEN 30 ELSE 31 END))
);
CREATE INDEX IF NOT EXISTS registry_people_church ON registry_people(church_id,status,name_key);
CREATE UNIQUE INDEX IF NOT EXISTS registry_user_once ON registry_people(church_id,user_id) WHERE user_id IS NOT NULL AND status<>'merged';
CREATE TABLE IF NOT EXISTS registry_forms (
 token_hash TEXT PRIMARY KEY, church_id TEXT NOT NULL REFERENCES churches(id), created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS registry_submissions (
 id TEXT PRIMARY KEY, church_id TEXT NOT NULL REFERENCES churches(id), branch_id TEXT,
 email TEXT NOT NULL, payload_cipher TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending_email'
 CHECK(status IN ('pending_email','pending_review','approved','rejected')),
 person_id TEXT, version INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL,
 FOREIGN KEY(church_id,branch_id) REFERENCES branches(church_id,id),
 FOREIGN KEY(church_id,person_id) REFERENCES registry_people(church_id,id)
);
CREATE TABLE IF NOT EXISTS registry_tokens (
 token_hash TEXT PRIMARY KEY, church_id TEXT NOT NULL REFERENCES churches(id),
 kind TEXT NOT NULL CHECK(kind IN ('verify','link','preferences')), target_id TEXT NOT NULL,
 email TEXT NOT NULL, target_version INTEGER NOT NULL, expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS registry_consents (
 id TEXT PRIMARY KEY, church_id TEXT NOT NULL, person_id TEXT NOT NULL, actor_id TEXT REFERENCES users(id),
 source TEXT NOT NULL, version TEXT NOT NULL, choices TEXT NOT NULL, created_at INTEGER NOT NULL,
 FOREIGN KEY(church_id,person_id) REFERENCES registry_people(church_id,id)
);
CREATE TRIGGER IF NOT EXISTS registry_consent_no_update BEFORE UPDATE ON registry_consents BEGIN SELECT RAISE(ABORT,'Consent history is append-only'); END;
CREATE TRIGGER IF NOT EXISTS registry_consent_no_delete BEFORE DELETE ON registry_consents BEGIN SELECT RAISE(ABORT,'Consent history is append-only'); END;
CREATE TABLE IF NOT EXISTS registry_followups (
 id TEXT PRIMARY KEY, church_id TEXT NOT NULL, person_id TEXT NOT NULL, assigned_to TEXT REFERENCES users(id),
 due_date TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','contacted','complete','cancelled')),
 note_cipher TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL,
 FOREIGN KEY(church_id,person_id) REFERENCES registry_people(church_id,id)
);
CREATE TABLE IF NOT EXISTS registry_imports (
 id TEXT PRIMARY KEY, church_id TEXT NOT NULL REFERENCES churches(id), created_by TEXT NOT NULL REFERENCES users(id),
 branch_id TEXT, payload_cipher TEXT NOT NULL, fingerprint TEXT NOT NULL, expires_at INTEGER NOT NULL,
 committed_at INTEGER, FOREIGN KEY(church_id,branch_id) REFERENCES branches(church_id,id)
);
CREATE TABLE IF NOT EXISTS registry_departments (
 id TEXT PRIMARY KEY, church_id TEXT NOT NULL REFERENCES churches(id), branch_id TEXT,
 name TEXT NOT NULL, leader_user_id TEXT REFERENCES users(id), allowed_roles TEXT NOT NULL,
 archived_at INTEGER, version INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL,
 UNIQUE(church_id,id), FOREIGN KEY(church_id,branch_id) REFERENCES branches(church_id,id)
);
CREATE TABLE IF NOT EXISTS worker_appointments (
 id TEXT PRIMARY KEY, church_id TEXT NOT NULL, person_id TEXT NOT NULL, department_id TEXT NOT NULL,
 role_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','active','ended','cancelled')),
 token_hash TEXT UNIQUE, expires_at INTEGER NOT NULL, invited_by TEXT NOT NULL REFERENCES users(id),
 person_version INTEGER NOT NULL, department_version INTEGER NOT NULL, role_version TEXT NOT NULL,
 membership_fingerprint TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, ended_at INTEGER,
 FOREIGN KEY(church_id,person_id) REFERENCES registry_people(church_id,id),
 FOREIGN KEY(church_id,department_id) REFERENCES registry_departments(church_id,id),
 FOREIGN KEY(church_id,role_id) REFERENCES roles(church_id,id)
);
CREATE UNIQUE INDEX IF NOT EXISTS registry_appointment_once ON worker_appointments(church_id,person_id,department_id) WHERE status IN ('pending','active');

-- Phase 6: attendance revisions, private ministry care and supervised child collection.
CREATE TABLE IF NOT EXISTS ministry_services (
 id TEXT PRIMARY KEY, church_id TEXT NOT NULL REFERENCES churches(id), branch_id TEXT,
 name TEXT NOT NULL, starts_at TEXT NOT NULL, ends_at TEXT NOT NULL,
 counting_method TEXT NOT NULL CHECK(counting_method IN ('whole','sections')),
 status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed','cancelled')),
 version INTEGER NOT NULL DEFAULT 1, created_by TEXT NOT NULL REFERENCES users(id), created_at INTEGER NOT NULL,
 UNIQUE(church_id,id), FOREIGN KEY(church_id,branch_id) REFERENCES branches(church_id,id)
);
CREATE TABLE IF NOT EXISTS ministry_slots (
 id TEXT PRIMARY KEY, church_id TEXT NOT NULL, service_id TEXT NOT NULL, name TEXT NOT NULL,
 assigned_to TEXT NOT NULL REFERENCES users(id), version INTEGER NOT NULL DEFAULT 1,
 status TEXT NOT NULL DEFAULT 'missing' CHECK(status IN ('missing','submitted','changes_requested','approved')),
 current_revision INTEGER NOT NULL DEFAULT 0, UNIQUE(service_id,name), UNIQUE(church_id,id),
 FOREIGN KEY(church_id,service_id) REFERENCES ministry_services(church_id,id)
);
CREATE TABLE IF NOT EXISTS ministry_counts (
 id TEXT PRIMARY KEY, church_id TEXT NOT NULL, slot_id TEXT NOT NULL, revision INTEGER NOT NULL,
 adults INTEGER NOT NULL CHECK(adults BETWEEN 0 AND 100000), children INTEGER NOT NULL CHECK(children BETWEEN 0 AND 100000),
 visitors INTEGER NOT NULL CHECK(visitors BETWEEN 0 AND adults+children),
 actual_start TEXT NOT NULL, actual_end TEXT NOT NULL, note TEXT NOT NULL, reason TEXT NOT NULL,
 created_by TEXT NOT NULL REFERENCES users(id), created_at INTEGER NOT NULL, UNIQUE(slot_id,revision),
 FOREIGN KEY(church_id,slot_id) REFERENCES ministry_slots(church_id,id)
);
CREATE TRIGGER IF NOT EXISTS ministry_count_no_update BEFORE UPDATE ON ministry_counts BEGIN SELECT RAISE(ABORT,'Attendance revisions are append-only'); END;
CREATE TRIGGER IF NOT EXISTS ministry_count_no_delete BEFORE DELETE ON ministry_counts BEGIN SELECT RAISE(ABORT,'Attendance revisions are append-only'); END;
CREATE TABLE IF NOT EXISTS ministry_events (
 id INTEGER PRIMARY KEY AUTOINCREMENT, church_id TEXT NOT NULL REFERENCES churches(id), kind TEXT NOT NULL,
 target TEXT NOT NULL, actor_id TEXT NOT NULL REFERENCES users(id), payload TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TRIGGER IF NOT EXISTS ministry_event_no_update BEFORE UPDATE ON ministry_events BEGIN SELECT RAISE(ABORT,'Ministry history is append-only'); END;
CREATE TRIGGER IF NOT EXISTS ministry_event_no_delete BEFORE DELETE ON ministry_events BEGIN SELECT RAISE(ABORT,'Ministry history is append-only'); END;
CREATE TABLE IF NOT EXISTS ministry_groups (
 id TEXT PRIMARY KEY, church_id TEXT NOT NULL REFERENCES churches(id), branch_id TEXT, name TEXT NOT NULL,
 leader_id TEXT NOT NULL REFERENCES users(id), version INTEGER NOT NULL DEFAULT 1, archived_at INTEGER,
 UNIQUE(church_id,id), FOREIGN KEY(church_id,branch_id) REFERENCES branches(church_id,id)
);
CREATE TABLE IF NOT EXISTS ministry_group_members (
 church_id TEXT NOT NULL, group_id TEXT NOT NULL, person_id TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1,
 PRIMARY KEY(group_id,person_id), FOREIGN KEY(church_id,group_id) REFERENCES ministry_groups(church_id,id),
 FOREIGN KEY(church_id,person_id) REFERENCES registry_people(church_id,id)
);
CREATE TABLE IF NOT EXISTS ministry_meetings (
 id TEXT PRIMARY KEY, church_id TEXT NOT NULL, group_id TEXT NOT NULL, held_on TEXT NOT NULL,
 version INTEGER NOT NULL DEFAULT 1, UNIQUE(group_id,held_on), UNIQUE(church_id,id),
 FOREIGN KEY(church_id,group_id) REFERENCES ministry_groups(church_id,id)
);
CREATE TABLE IF NOT EXISTS ministry_group_attendance (
 church_id TEXT NOT NULL, meeting_id TEXT NOT NULL, person_id TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('present','absent','excused')),
 PRIMARY KEY(meeting_id,person_id), FOREIGN KEY(church_id,meeting_id) REFERENCES ministry_meetings(church_id,id),
 FOREIGN KEY(church_id,person_id) REFERENCES registry_people(church_id,id)
);
CREATE TABLE IF NOT EXISTS ministry_cases (
 id TEXT PRIMARY KEY, church_id TEXT NOT NULL REFERENCES churches(id), branch_id TEXT, person_id TEXT,
 kind TEXT NOT NULL CHECK(kind IN ('care','prayer','appointment','welfare','safeguarding')),
 confidential INTEGER NOT NULL CHECK(confidential IN (0,1)), assigned_to TEXT NOT NULL REFERENCES users(id),
 created_by TEXT NOT NULL REFERENCES users(id), status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','approved','declined','resolved','escalated')),
 content_cipher TEXT NOT NULL, consent_at INTEGER, version INTEGER NOT NULL DEFAULT 1,
 starts_at TEXT, ends_at TEXT, amount_minor INTEGER, currency TEXT, created_at INTEGER NOT NULL,
 UNIQUE(church_id,id), FOREIGN KEY(church_id,branch_id) REFERENCES branches(church_id,id),
 FOREIGN KEY(church_id,person_id) REFERENCES registry_people(church_id,id)
);
CREATE INDEX IF NOT EXISTS ministry_case_scope ON ministry_cases(church_id,kind,assigned_to,status);
CREATE TABLE IF NOT EXISTS ministry_guardians (
 id TEXT PRIMARY KEY, church_id TEXT NOT NULL, child_id TEXT NOT NULL, content_cipher TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','revoked')), version INTEGER NOT NULL DEFAULT 1,
 created_by TEXT NOT NULL REFERENCES users(id), created_at INTEGER NOT NULL, UNIQUE(church_id,id),
 FOREIGN KEY(church_id,child_id) REFERENCES registry_people(church_id,id)
);
CREATE TABLE IF NOT EXISTS ministry_checkins (
 id TEXT PRIMARY KEY, church_id TEXT NOT NULL, service_id TEXT NOT NULL, child_id TEXT NOT NULL, guardian_id TEXT NOT NULL,
 code_hash TEXT NOT NULL, checked_in_by TEXT NOT NULL REFERENCES users(id), checked_in_at INTEGER NOT NULL,
 checked_out_by TEXT REFERENCES users(id), checked_out_at INTEGER, version INTEGER NOT NULL DEFAULT 1,
 FOREIGN KEY(church_id,service_id) REFERENCES ministry_services(church_id,id),
 FOREIGN KEY(church_id,child_id) REFERENCES registry_people(church_id,id),
 FOREIGN KEY(church_id,guardian_id) REFERENCES ministry_guardians(church_id,id)
);
CREATE UNIQUE INDEX IF NOT EXISTS ministry_child_once ON ministry_checkins(church_id,child_id) WHERE checked_out_at IS NULL;
