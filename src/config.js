import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { secret } from './security.js';

export function loadConfig(env=process.env) {
  const production=env.NODE_ENV==='production',origin=env.APP_ORIGIN||'http://127.0.0.1:3000';
  const parsed=new URL(origin);
  if(parsed.origin!==origin || parsed.username || parsed.password)throw new Error('APP_ORIGIN must be a canonical origin without a path or credentials');
  if(production && parsed.protocol!=='https:')throw new Error('Production requires an HTTPS APP_ORIGIN');
  if(!['http:','https:'].includes(parsed.protocol))throw new Error('Unsupported APP_ORIGIN protocol');
  const databasePath=resolve(env.DATABASE_PATH||'./data/jesusseat.sqlite');
  let outboxKey=env.OUTBOX_KEY;
  if(production && (!outboxKey || outboxKey.length<32 || !env.MAIL_API_KEY || !env.MAIL_FROM))throw new Error('Configure OUTBOX_KEY (32+ characters), MAIL_API_KEY and MAIL_FROM before production startup');
  if(!outboxKey) {
    mkdirSync(dirname(databasePath),{recursive:true,mode:0o700});
    const keyPath=join(dirname(databasePath),'outbox.key');
    if(!existsSync(keyPath))writeFileSync(keyPath,secret(),{mode:0o600,flag:'wx'});
    outboxKey=readFileSync(keyPath,'utf8').trim();
  }
  return {production,origin,databasePath,outboxKey,host:env.HOST||'127.0.0.1',port:Number(env.PORT||3000),mailKey:env.MAIL_API_KEY,mailFrom:env.MAIL_FROM};
}
