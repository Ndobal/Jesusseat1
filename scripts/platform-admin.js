import { loadConfig } from '../src/config.js';
import { openDatabase, transaction, audit } from '../src/db.js';
import { email } from '../src/security.js';
const [action,address]=process.argv.slice(2);
if(!['grant','revoke','list'].includes(action))throw new Error('Usage: npm run admin -- grant|revoke email, or list');
const config=loadConfig(),db=openDatabase(config.databasePath);
if(action==='list'){
  for(const row of db.prepare('SELECT u.email,p.granted_at FROM platform_admins p JOIN users u ON u.id=p.user_id ORDER BY u.email').all())console.log(row.email,new Date(row.granted_at).toISOString());
}else{
  const user=db.prepare('SELECT * FROM users WHERE email=?').get(email(address));if(!user)throw new Error('Register the account first.');
  transaction(db,()=>{
    if(action==='grant'){
      if(!user.verified_at||!db.prepare('SELECT user_id FROM account_mfa WHERE user_id=?').get(user.id))throw new Error('Verify the account and enable authenticator verification before granting platform access.');
      db.prepare('INSERT OR IGNORE INTO platform_admins VALUES(?,?)').run(user.id,Date.now());
    }else db.prepare('DELETE FROM platform_admins WHERE user_id=?').run(user.id);
    audit(db,null,null,`platform.admin_${action}`,user.id,{source:'host-cli'});
  });console.log(`Platform access ${action==='grant'?'granted':'revoked'} for ${user.email}.`);
}
db.close();
