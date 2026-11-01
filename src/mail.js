import { transaction } from './db.js';
import { decrypt } from './security.js';

export async function deliverMail(db,config,send=fetch) {
  if(!config.mailKey||!config.mailFrom)return {configured:false};
  const row=transaction(db,()=>{
    const row=db.prepare('SELECT * FROM outbox WHERE sent_at IS NULL AND next_attempt_at<=? AND lease_until<? ORDER BY created_at LIMIT 1').get(Date.now(),Date.now());
    if(row)db.prepare('UPDATE outbox SET lease_until=? WHERE id=?').run(Date.now()+60_000,row.id);
    return row;
  });
  if(!row)return {configured:true,empty:true};
  try {
    const response=await send('https://api.resend.com/emails',{
      method:'POST',signal:AbortSignal.timeout(20_000),
      headers:{Authorization:`Bearer ${config.mailKey}`,'Content-Type':'application/json','Idempotency-Key':`jesusseat/${row.id}`},
      body:JSON.stringify({from:config.mailFrom,to:[row.recipient],subject:row.subject,text:decrypt(row.payload,config.outboxKey)})
    });
    if(!response.ok)throw new Error(`Provider status ${response.status}`);
    db.prepare('UPDATE outbox SET sent_at=?,payload=?,lease_until=0,last_error=NULL WHERE id=?').run(Date.now(),'[delivered]',row.id);
    return {delivered:true};
  } catch {
    const attempts=row.attempts+1;
    db.prepare('UPDATE outbox SET attempts=?,next_attempt_at=?,lease_until=0,last_error=? WHERE id=?')
      .run(attempts,Date.now()+Math.min(3600_000,30_000*2**Math.min(attempts,7)),'Delivery failed; inspect provider configuration or service health.',row.id);
    return {delivered:false};
  }
}
