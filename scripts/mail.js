import { loadConfig } from '../src/config.js';
import { openDatabase } from '../src/db.js';
import { decrypt } from '../src/security.js';
const config=loadConfig();
if(config.production)throw new Error('Local mail inspection is disabled in production.');
const db=openDatabase(config.databasePath);
console.log('LOCAL DEVELOPMENT ONLY — confidential, unexpired links. Do not share this output.');
for(const row of db.prepare('SELECT * FROM outbox WHERE sent_at IS NULL ORDER BY created_at DESC LIMIT 10').all()) {
  console.log(`\nTo: ${row.recipient}\nSubject: ${row.subject}\n${decrypt(row.payload,config.outboxKey)}`);
}
db.close();
