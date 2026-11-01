import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase } from './db.js';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { deliverMail } from './mail.js';

const publicRoot=fileURLToPath(new URL('../public/',import.meta.url));
const pages=new Set(['/','/app','/login','/register','/forgot','/reset','/verify','/invite','/new-church','/participation','/security']);
const files=new Set(['/app.js','/styles.css','/icon.svg']);
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
      if(url.pathname.startsWith('/api/')) {
        if(!['GET','POST','PATCH','DELETE'].includes(req.method))return respond(405,JSON.stringify({error:'Method not allowed.'}),{'Content-Type':'application/json'});
        let body={};
        if(req.method!=='GET') {
          if(req.headers.origin!==config.origin)return respond(403,JSON.stringify({error:'Request origin is not allowed.'}),{'Content-Type':'application/json'});
          if(req.headers['content-type']?.split(';')[0]!=='application/json')return respond(415,JSON.stringify({error:'Send application/json.'}),{'Content-Type':'application/json'});
          let size=0;const chunks=[];
          for await(const chunk of req) {size+=chunk.length;if(size>32_768)return respond(413,JSON.stringify({error:'Request is too large.'}),{'Content-Type':'application/json'});chunks.push(chunk);}
          try {body=JSON.parse(Buffer.concat(chunks).toString()||'{}');} catch{return respond(400,JSON.stringify({error:'Invalid JSON.'}),{'Content-Type':'application/json'});}
          if(!body||Array.isArray(body)||typeof body!=='object')return respond(400,JSON.stringify({error:'Send a JSON object.'}),{'Content-Type':'application/json'});
        }
        // Deliberately ignore untrusted forwarding headers. Run one app process behind a trusted reverse proxy.
        const result=await app({method:req.method,path:url.pathname,query:url.searchParams,body,headers:req.headers,ip:req.socket.remoteAddress});
        return respond(result.status||200,JSON.stringify(result.data),{'Content-Type':'application/json; charset=utf-8',...(result.cookie?{'Set-Cookie':result.cookie}:{})});
      }
      if(req.method!=='GET'&&req.method!=='HEAD')return respond(405,'Method not allowed');
      const file=pages.has(url.pathname)?'index.html':files.has(url.pathname)?url.pathname.slice(1):null;
      if(!file)return respond(404,'Page not found');
      const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'};
      const data=await readFile(resolve(publicRoot,file));
      respond(200,req.method==='HEAD'?'':data,{'Content-Type':types[extname(file)]});
    } catch {respond(500,JSON.stringify({error:'Unable to process this request.'}),{'Content-Type':'application/json'});}
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
