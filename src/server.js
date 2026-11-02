import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase } from './db.js';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { deliverMail } from './mail.js';
import { renderPublicPage, sitemap } from './public-pages.js';
import { contactToken } from './public-services.js';
import { TEMPLATE_DETAILS } from './public-data.js';
import { renderRegistryJoin,renderRegistryToken } from './registry-pages.js';
import { renderChurchSite } from './church-site.js';
import { publishedSite,siteAssets } from './websites.js';
import { decrypt } from './security.js';
import { html } from './public-pages.js';
import { HttpError } from './security.js';

const publicRoot=fileURLToPath(new URL('../public/',import.meta.url));
const pages=new Set(['/app','/login','/register','/forgot','/reset','/verify','/invite','/new-church','/security','/mfa','/platform/inbox','/registry-link','/worker-appointment']);
const files=new Set(['/app.js','/styles.css','/icon.svg','/public.css','/public.js','/church-site.css','/church-site.js','/registry-public.js','/registry-editor.js','/ministry-editor.js','/assets/community-hero.webp',...TEMPLATE_DETAILS.map(t=>`/assets/${t.id}.webp`)]);
export function createHttpServer(config,db) {
  const app=createApp({db,...config});
  return createServer(async(req,res)=>{
    const security={
      'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer',
      'Permissions-Policy':'camera=(), microphone=(), geolocation=()',
      'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
      'Cache-Control':'no-store',...(config.production?{'Strict-Transport-Security':'max-age=31536000'}:{})
    };
    const respond=(status,data,extra={})=>{res.writeHead(status,{...security,...extra});res.end(data);};
    try {
      const url=new URL(req.url,config.origin);
      const join=url.pathname.match(/^\/join\/([a-z0-9-]+)(\/preferences)?$/);
      if(join&&['GET','HEAD','POST'].includes(req.method)){
        const slug=join[1],base=`/api/public/registry/${slug}`,info=await app({method:'GET',path:base+'/info',headers:req.headers,ip:req.socket.remoteAddress});
        if(info.status>=400)return respond(info.status,'Church registration is not available.');
        let receipt='',error='',status=200;
        if(req.method==='POST'){
          if(req.headers.origin!==config.origin)return respond(403,'Request origin is not allowed.');if(req.headers['content-type']?.split(';')[0]!=='application/x-www-form-urlencoded')return respond(415,'Use the registration form.');
          let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>32768)return respond(413,'Form too large.');chunks.push(chunk);}
          const body=Object.fromEntries(new URLSearchParams(Buffer.concat(chunks).toString()));for(const key of ['consent','email_birthday','whatsapp_birthday','sms_birthday','birthday_share'])body[key]=body[key]==='on';
          const r=await app({method:'POST',path:base+(join[2]?'/preferences-request':'/join'),body,headers:req.headers,ip:req.socket.remoteAddress});status=r.status>=400?r.status:200;if(status>=400)error=r.data.error;else receipt=r.data.message;
        }
        const nonce=await app({method:'GET',path:base+'/token',headers:req.headers,ip:req.socket.remoteAddress});if(nonce.status>=400)return respond(nonce.status,JSON.stringify(nonce.data));
        return respond(status,req.method==='HEAD'?'':renderRegistryJoin(info.data,nonce.data.nonce,receipt,error),{'Content-Type':'text/html; charset=utf-8','X-Robots-Tag':'noindex, nofollow'});
      }
      if(['/registry/verify','/registry/preferences'].includes(url.pathname)&&['GET','HEAD'].includes(req.method))return respond(200,req.method==='HEAD'?'':renderRegistryToken(url.pathname.endsWith('/verify')?'verify':'preferences'),{'Content-Type':'text/html; charset=utf-8','X-Robots-Tag':'noindex, nofollow'});
      const sitePost=url.pathname.match(/^\/c\/([a-z0-9-]+)\/send$/);
      if(req.method==='POST'&&sitePost){
        if(req.headers.origin!==config.origin)return respond(403,'Request origin is not allowed.');
        if(req.headers['content-type']?.split(';')[0]!=='application/x-www-form-urlencoded')return respond(415,'Use the contact form.');
        let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>32768)return respond(413,'Message too large.');chunks.push(chunk);}
        const body=Object.fromEntries(new URLSearchParams(Buffer.concat(chunks).toString()));body.consent=body.consent==='on';
        const r=await app({method:'POST',path:`/api/public/sites/${sitePost[1]}/messages`,body,headers:req.headers,ip:req.socket.remoteAddress});
        if(r.status>=400)return respond(r.status,`<!doctype html><html lang="en"><meta charset="utf-8"><title>Message not sent</title><h1>Message not sent</h1><p>${html(r.data.error)}</p><a href="/c/${sitePost[1]}">Return to the church</a></html>`,{'Content-Type':'text/html; charset=utf-8'});
        const pub=publishedSite(db,sitePost[1]),snapshot=JSON.parse(pub.snapshot);
        return respond(200,renderChurchSite({snapshot,base:`/c/${sitePost[1]}`,path:body.page==='home'?'':body.page,origin:config.origin,receipt:{...r.data,kind:body.kind}}),{'Content-Type':'text/html; charset=utf-8'});
      }
      if(req.method==='POST'&&url.pathname==='/contact'){
        if(req.headers.origin!==config.origin)return respond(403,'Request origin is not allowed.');
        if(req.headers['content-type']?.split(';')[0]!=='application/x-www-form-urlencoded')return respond(415,'Use the contact form.');
        let size=0;const chunks=[];
        for await(const chunk of req){size+=chunk.length;if(size>32768)return respond(413,'Message is too large.');chunks.push(chunk);}
        const body=Object.fromEntries(new URLSearchParams(Buffer.concat(chunks).toString()));body.consent=body.consent==='on';
        const result=await app({method:'POST',path:'/api/public/contact',body,headers:req.headers,ip:req.socket.remoteAddress});
        const nonce=result.status>=400?contactToken(db,req.socket.remoteAddress):'';
        const content=renderPublicPage({path:'/contact',db,config,nonce,receipt:result.status<400?result.data:null,error:result.data.error});
        return respond(result.status>=400?result.status:200,content,{'Content-Type':'text/html; charset=utf-8'});
      }
      if(url.pathname.startsWith('/api/')) {
        if(!['GET','POST','PATCH','DELETE'].includes(req.method))return respond(405,JSON.stringify({error:'Method not allowed.'}),{'Content-Type':'application/json'});
        let body={};
        if(req.method!=='GET') {
          if(req.headers.origin!==config.origin)return respond(403,JSON.stringify({error:'Request origin is not allowed.'}),{'Content-Type':'application/json'});
          if(req.headers['content-type']?.split(';')[0]!=='application/json')return respond(415,JSON.stringify({error:'Send application/json.'}),{'Content-Type':'application/json'});
          const upload=/^\/api\/churches\/[a-f0-9]{32}\/website\/assets$/.test(url.pathname),siteEdit=/^\/api\/churches\/[a-f0-9]{32}\/website$/.test(url.pathname);
          const importCsv=/^\/api\/churches\/[a-f0-9]{32}\/registry\/imports$/.test(url.pathname);
          const maxBody=upload?2200000:siteEdit||importCsv?262144:32768;
          let size=0;const chunks=[];
          for await(const chunk of req) {size+=chunk.length;if(size>maxBody)return respond(413,JSON.stringify({error:'Request is too large.'}),{'Content-Type':'application/json'});chunks.push(chunk);}
          try {body=JSON.parse(Buffer.concat(chunks).toString()||'{}');} catch{return respond(400,JSON.stringify({error:'Invalid JSON.'}),{'Content-Type':'application/json'});}
          if(!body||Array.isArray(body)||typeof body!=='object')return respond(400,JSON.stringify({error:'Send a JSON object.'}),{'Content-Type':'application/json'});
        }
        // Deliberately ignore untrusted forwarding headers. Run one app process behind a trusted reverse proxy.
        const result=await app({method:req.method,path:url.pathname,query:url.searchParams,body,headers:req.headers,ip:req.socket.remoteAddress});
        return respond(result.status||200,JSON.stringify(result.data),{'Content-Type':'application/json; charset=utf-8',...(result.cookies?{'Set-Cookie':result.cookies}:result.cookie?{'Set-Cookie':result.cookie}:{})});
      }
      if(req.method!=='GET'&&req.method!=='HEAD')return respond(405,'Method not allowed');
      const previewRoute=url.pathname.match(/^\/website-preview\/([a-f0-9]{32})(?:\/(.*))?$/);
      if(previewRoute){
        const rest=previewRoute[2]||'',asset=rest.match(/^media\/([a-f0-9]{32})$/);
        const target=asset?`/api/churches/${previewRoute[1]}/website/assets/${asset[1]}`:`/api/churches/${previewRoute[1]}/website`;
        const r=await app({method:'GET',path:target,query:url.searchParams,headers:req.headers,ip:req.socket.remoteAddress});
        if(r.status>=400)return respond(r.status,JSON.stringify(r.data),{'Content-Type':'application/json','X-Robots-Tag':'noindex, nofollow'});
        if(asset)return respond(200,req.method==='HEAD'?'':Buffer.from(r.data.data,'base64'),{'Content-Type':r.data.mime,'X-Robots-Tag':'noindex, nofollow'});
        const revision=url.searchParams.get('revision'),base=`/website-preview/${previewRoute[1]}`;
        let content=renderChurchSite({snapshot:r.data.snapshot,base,path:rest,preview:true,origin:config.origin});
        if(!content)return respond(404,'Page not found');
        if(revision)content=content.replace(/href="(\/website-preview\/[^"]*)"/g,(_,href)=>`href="${href}?revision=${encodeURIComponent(revision)}"`);
        return respond(200,req.method==='HEAD'?'':content,{'Content-Type':'text/html; charset=utf-8','X-Robots-Tag':'noindex, nofollow'});
      }
      const tenantRoute=url.pathname.match(/^\/c\/([a-z0-9-]+)(?:\/(.*))?$/);
      if(tenantRoute){
        const pub=publishedSite(db,tenantRoute[1]);if(!pub)return respond(404,'Church website not found');
        const snapshot=JSON.parse(pub.snapshot),rest=tenantRoute[2]||'',asset=rest.match(/^media\/([a-f0-9]{32})$/);
        if(asset){if(!siteAssets(snapshot).has(asset[1]))return respond(404,'Image not found');const row=db.prepare('SELECT mime,data FROM website_assets WHERE id=? AND church_id=?').get(asset[1],pub.church_id);if(!row)return respond(404,'Image not found');return respond(200,req.method==='HEAD'?'':row.data,{'Content-Type':row.mime});}
        if(rest==='sitemap.xml'){const paths=snapshot.pages.filter(p=>p.enabled).flatMap(p=>[p.slug==='home'?'':p.slug,...p.items.map(i=>`${p.slug}/${i.slug}`)]);return respond(200,req.method==='HEAD'?'':`<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map(p=>`<url><loc>${html(config.origin+'/c/'+tenantRoute[1]+(p?'/'+p:''))}</loc></url>`).join('')}</urlset>`,{'Content-Type':'application/xml'});}
        const page=snapshot.pages.find(p=>p.slug===(rest.split('/')[0]||'home')&&p.enabled);let nonce='';
        if(page&&(page.slug==='contact'||page.allowComments)&&req.method==='GET'){const token=await app({method:'GET',path:`/api/public/sites/${tenantRoute[1]}/token`,headers:req.headers,ip:req.socket.remoteAddress});if(token.status>=400)return respond(token.status,JSON.stringify(token.data));nonce=token.data.nonce;}
        const comments=page?.allowComments?db.prepare("SELECT name,message_cipher FROM website_messages WHERE church_id=? AND page_slug=? AND kind='comment' AND status='approved' ORDER BY created_at DESC,id LIMIT 100").all(pub.church_id,page.slug).map(c=>({name:c.name,message:decrypt(c.message_cipher,config.outboxKey)})):[];
        const content=renderChurchSite({snapshot,base:`/c/${tenantRoute[1]}`,path:rest,origin:config.origin,nonce,comments,joinEnabled:!!db.prepare('SELECT church_id FROM registry_settings WHERE church_id=? AND enabled=1').get(pub.church_id)});if(!content)return respond(404,'Page not found');
        return respond(200,req.method==='HEAD'?'':content,{'Content-Type':'text/html; charset=utf-8'});
      }
      if(url.pathname==='/participation')return respond(308,'',{'Location':'/terms'});
      if(url.pathname==='/robots.txt')return respond(200,`User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /app\nDisallow: /platform/\nDisallow: /security\nDisallow: /new-church\nDisallow: /verify\nDisallow: /reset\nDisallow: /invite\nDisallow: /mfa\nDisallow: /website-preview/\nDisallow: /join/\nDisallow: /registry/\nDisallow: /registry-link\nDisallow: /worker-appointment\nSitemap: ${config.origin}/sitemap.xml\n${db.prepare("SELECT c.slug FROM website_publications p JOIN churches c ON c.id=p.church_id WHERE c.status='active' ORDER BY c.slug LIMIT 10000").all().map(c=>`Sitemap: ${config.origin}/c/${c.slug}/sitemap.xml`).join('\n')}\n`,{'Content-Type':'text/plain; charset=utf-8'});
      if(url.pathname==='/sitemap.xml')return respond(200,req.method==='HEAD'?'':sitemap(db,config.origin),{'Content-Type':'application/xml; charset=utf-8'});
      const nonce=url.pathname==='/contact'&&req.method==='GET'?contactToken(db,req.socket.remoteAddress):'';
      const publicPage=renderPublicPage({path:url.pathname,query:url.searchParams,db,config,nonce});
      if(publicPage)return respond(200,req.method==='HEAD'?'':publicPage,{'Content-Type':'text/html; charset=utf-8'});
      const file=pages.has(url.pathname)?'index.html':files.has(url.pathname)?url.pathname.slice(1):null;
      if(!file)return respond(404,'Page not found');
      const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.webp':'image/webp'};
      const data=await readFile(resolve(publicRoot,file));
      respond(200,req.method==='HEAD'?'':data,{'Content-Type':types[extname(file)]});
    } catch(error) {respond(error instanceof HttpError?error.status:500,JSON.stringify({error:error instanceof HttpError?error.message:'Unable to process this request.'}),{'Content-Type':'application/json'});}
  });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const config=loadConfig();
  // Managed preview tools append these conventional dev-server flags.
  for(const [flag,key] of [['--port','port'],['--host','host']]) {
    const at=process.argv.indexOf(flag);
    if(at>=0&&process.argv[at+1])config[key]=key==='port'?Number(process.argv[at+1]):process.argv[at+1];
  }
  const db=openDatabase(config.databasePath),server=createHttpServer(config,db);
  server.requestTimeout=20_000;server.headersTimeout=15_000;server.maxRequestsPerSocket=100;
  let mailing=false;
  const timer=setInterval(async()=>{if(mailing)return;mailing=true;try{await deliverMail(db,config);}finally{mailing=false;}},10_000);
  server.listen(config.port,config.host,()=>console.log(`JesusSeat listening on ${config.origin}${!config.mailKey?' — email queued locally; use npm run mail for development links.':''}`));
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{clearInterval(timer);server.close(()=>process.exit(0));setTimeout(()=>process.exit(1),25_000).unref();});
}
