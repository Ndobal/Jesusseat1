import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { secret } from './security.js';
import { safeExternalUrl } from './public-services.js';

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
  const donationUrl=safeExternalUrl(env.DONATION_CHECKOUT_URL||'');
  const donationLabel=(env.DONATION_PROVIDER_LABEL||'').trim();
  if(donationUrl&&(!donationLabel||donationLabel.length>80))throw new Error('Set DONATION_PROVIDER_LABEL when enabling a checkout link');
  const notificationEmail=(env.PLATFORM_NOTIFICATION_EMAIL||'').trim();
  if(notificationEmail&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(notificationEmail))throw new Error('Invalid PLATFORM_NOTIFICATION_EMAIL');
  return {production,origin,databasePath,outboxKey,host:env.HOST||'127.0.0.1',port:Number(env.PORT||3000),mailKey:env.MAIL_API_KEY,mailFrom:env.MAIL_FROM,donationUrl,donationLabel,notificationEmail};
}
