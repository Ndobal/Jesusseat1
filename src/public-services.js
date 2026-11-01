import { audit, transaction } from './db.js';
import { id, secret, digest, text, email, encrypt, decrypt, fail, rateLimit } from './security.js';
import { context, requireGlobal } from './permissions.js';
import { TOPICS, PRIVACY_VERSION } from './public-data.js';

export function safeExternalUrl(value, required = false) {
  if (!value && !required) return '';
  if (typeof value !== 'string' || value.length > 1000) fail(400, 'Enter a valid HTTPS website address.');
  let u; try { u = new URL(value); } catch { fail(400, 'Enter a valid HTTPS website address.'); }
  if (u.protocol !== 'https:' || u.username || u.password) fail(400, 'Use an HTTPS address without embedded credentials.');
  return u.href;
}

export function contactToken(db, ip) {
  rateLimit(db, `contact-form:${digest(ip || 'unknown')}`, 40, 3600_000);
  const token = secret(), now = Date.now();
  db.prepare('DELETE FROM public_contact_tokens WHERE expires_at<=?').run(now);
  db.prepare('INSERT INTO public_contact_tokens VALUES(?,?,?)').run(digest(token), now, now + 30 * 60_000);
  return token;
}

export function platformAccess(db, session) {
  if (!session.verified_at || !db.prepare('SELECT user_id FROM platform_admins WHERE user_id=?').get(session.user_id)) fail(403, 'Platform administrator access is required.');
  if (!db.prepare('SELECT user_id FROM account_mfa WHERE user_id=?').get(session.user_id)) fail(403, 'Enable two-step verification before opening the platform inbox.');
}

export function directoryList(db, query = new URLSearchParams()) {
  const q = (query.get('q') || '').trim(); if (q.length > 80) fail(400, 'Search is too long.');
  const page = Number(query.get('page') || 1); if (!Number.isInteger(page) || page < 1 || page > 1000) fail(400, 'Invalid page.');
  const search = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
  const where = `FROM church_directory d JOIN churches c ON c.id=d.church_id WHERE d.published=1 AND c.status='active' AND (c.name LIKE ? ESCAPE '\\' OR c.city LIKE ? ESCAPE '\\' OR c.country LIKE ? ESCAPE '\\')`;
  const total = db.prepare(`SELECT count(*) n ${where}`).get(search, search, search).n;
  const churches = db.prepare(`SELECT c.name,c.slug,c.city,c.country,d.summary,d.website_url ${where} ORDER BY c.name,c.id LIMIT 12 OFFSET ?`).all(search, search, search, (page - 1) * 12);
  return { churches, total, page, nextPage: page * 12 < total ? page + 1 : null, query: q };
}
export function directoryDetail(db, slug) {
  return db.prepare(`SELECT c.name,c.slug,c.city,c.country,d.summary,d.website_url FROM church_directory d JOIN churches c ON c.id=d.church_id WHERE c.slug=? AND c.status='active' AND d.published=1`).get(slug);
}

export function createPublicServices({ db, key, origin, queueMail, notificationEmail }) {
  return {
    submitContact(body, ip) {
      rateLimit(db, `contact-submit:${digest(ip || 'unknown')}`, 5, 3600_000);
      if (body.website) fail(400, 'Unable to submit this form.');
      const name = text(body.name, 'Name', 2, 100), address = email(body.email), topic = body.topic;
      if (!TOPICS.includes(topic)) fail(400, 'Choose a valid enquiry topic.');
      const subject = text(body.subject, 'Subject', 3, 160), message = text(body.message, 'Message', 10, 5000);
      if (body.consent !== true || body.privacyVersion !== PRIVACY_VERSION) fail(400, 'Read the privacy notice and agree to handling this enquiry.');
      if (typeof body.nonce !== 'string' || body.nonce.length > 100) fail(400, 'Reload the form and try again.');
      rateLimit(db, `contact-address:${digest(address)}`, 3, 3600_000);
      const enquiryId = id();
      transaction(db, () => {
        const token = db.prepare('SELECT * FROM public_contact_tokens WHERE token_hash=? AND expires_at>?').get(digest(body.nonce), Date.now());
        if (!token) fail(400, 'This form has expired or has already been sent. Reload it to send a new enquiry.');
        if (Date.now() - token.created_at < 1500) fail(400, 'Please take a moment to review your message before sending.');
        db.prepare('DELETE FROM public_contact_tokens WHERE token_hash=?').run(token.token_hash);
        db.prepare(`INSERT INTO public_enquiries(id,name,email,topic,subject,message_cipher,privacy_version,consent_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)`)
          .run(enquiryId, name, address, topic, subject, encrypt(message, key), PRIVACY_VERSION, Date.now(), Date.now(), Date.now());
        audit(db, null, null, 'public.enquiry_received', enquiryId, { topic });
        if (notificationEmail) queueMail(notificationEmail, `New JesusSeat enquiry · ${enquiryId.slice(0,8)}`,
          `A new ${topic} enquiry is waiting in your platform inbox.\n${origin}/platform/inbox\nReference: ${enquiryId}\n\nSign in with your verified platform account and two-step verification. Enquiry content is not included in this alert.`);
      });
      return { reference: enquiryId.slice(0, 8).toUpperCase(), message: 'Thank you for contacting JesusSeat. Keep your reference for any follow-up.' };
    },
    inbox(session, query = new URLSearchParams()) {
      platformAccess(db, session);
      const status = query.get('status') || 'new';
      if (!['new','open','resolved','all'].includes(status)) fail(400, 'Invalid enquiry status.');
      const page = Number(query.get('page') || 1); if (!Number.isInteger(page) || page < 1 || page > 1000) fail(400, 'Invalid page.');
      const where = status === 'all' ? '' : 'WHERE status=?', args = status === 'all' ? [] : [status];
      const rows = db.prepare(`SELECT id,name,email,topic,subject,status,created_at,updated_at,version FROM public_enquiries ${where} ORDER BY created_at DESC,id LIMIT 25 OFFSET ?`).all(...args, (page - 1) * 25);
      const counts = db.prepare('SELECT status,count(*) total FROM public_enquiries GROUP BY status').all();
      return { enquiries: rows, counts, page, status };
    },
    enquiry(session, enquiryId) {
      platformAccess(db, session);
      const row = db.prepare('SELECT * FROM public_enquiries WHERE id=?').get(enquiryId);
      if (!row) fail(404, 'Enquiry not found.');
      const replies = db.prepare(`SELECT r.id,r.body_cipher,r.created_at,u.name author FROM public_enquiry_replies r JOIN users u ON u.id=r.author_id WHERE r.enquiry_id=? ORDER BY r.created_at,r.id`).all(enquiryId);
      const { message_cipher, ...safe } = row;
      return { enquiry: { ...safe, message: decrypt(message_cipher, key) }, replies: replies.map(({ body_cipher, ...reply }) => ({ ...reply, message: decrypt(body_cipher, key) })) };
    },
    updateEnquiry(session, enquiryId, body) {
      platformAccess(db, session);
      if (!['new','open','resolved'].includes(body.status)) fail(400, 'Choose a valid status.');
      transaction(db, () => {
        const row = db.prepare('SELECT version FROM public_enquiries WHERE id=?').get(enquiryId);
        if (!row) fail(404, 'Enquiry not found.'); if (body.version !== row.version) fail(409, 'This enquiry changed. Reload it before saving.');
        db.prepare('UPDATE public_enquiries SET status=?,updated_at=?,version=version+1 WHERE id=?').run(body.status, Date.now(), enquiryId);
        audit(db, null, session.user_id, 'public.enquiry_status', enquiryId, { status: body.status });
      }); return { message: 'Enquiry status updated.' };
    },
    reply(session, enquiryId, body) {
      platformAccess(db, session);
      const message = text(body.message, 'Reply', 5, 5000);
      transaction(db, () => {
        const row = db.prepare('SELECT * FROM public_enquiries WHERE id=?').get(enquiryId);
        if (!row) fail(404, 'Enquiry not found.'); if (body.version !== row.version) fail(409, 'This enquiry changed. Reload it before replying.');
        const replyId = id();
        db.prepare('INSERT INTO public_enquiry_replies VALUES(?,?,?,?,?)').run(replyId, enquiryId, session.user_id, encrypt(message, key), Date.now());
        db.prepare('UPDATE public_enquiries SET status=?,version=version+1,updated_at=? WHERE id=?').run(body.resolve === true ? 'resolved' : 'open', Date.now(), enquiryId);
        queueMail(row.email, `JesusSeat enquiry ${enquiryId.slice(0,8).toUpperCase()}`, `Hello ${row.name},\n\n${message}\n\nReference: ${enquiryId.slice(0,8).toUpperCase()}\nFor another message, use ${origin}/contact and include this reference.\n\nJesusSeat — an evangelical product of Ndovera Limited.`);
        audit(db, null, session.user_id, 'public.enquiry_reply', enquiryId, { reply: replyId });
      }); return { message: 'Reply saved and queued for email delivery.' };
    },
    directorySettings(session, churchId) {
      const ctx = context(db, churchId, session.user_id, 'church.manage'); requireGlobal(ctx);
      return { listing: db.prepare('SELECT * FROM church_directory WHERE church_id=?').get(churchId) || { summary:'',website_url:'',published:0,version:0 } };
    },
    saveDirectory(session, churchId, body) {
      const ctx = context(db, churchId, session.user_id, 'church.manage'); requireGlobal(ctx);
      if (typeof body.published !== 'boolean') fail(400, 'Choose whether to publish this listing.');
      const summary = body.summary ? text(body.summary, 'Public introduction', body.published ? 10 : 0, 1500) : '';
      if (body.published && !summary) fail(400, 'Add a public introduction before publishing.');
      const website = safeExternalUrl(body.website_url);
      transaction(db, () => {
        const row = db.prepare('SELECT version FROM church_directory WHERE church_id=?').get(churchId);
        if (body.version !== (row?.version || 0)) fail(409, 'This listing changed. Reload it before saving.');
        db.prepare(`INSERT INTO church_directory(church_id,summary,website_url,published,updated_at) VALUES(?,?,?,?,?)
          ON CONFLICT(church_id) DO UPDATE SET summary=excluded.summary,website_url=excluded.website_url,published=excluded.published,updated_at=excluded.updated_at,version=church_directory.version+1`)
          .run(churchId, summary, website, body.published ? 1 : 0, Date.now());
        audit(db, churchId, session.user_id, 'directory.update', churchId, { published:body.published });
      }); return { message: body.published ? 'Your church listing is published.' : 'Your church listing is private.' };
    }
  };
}
