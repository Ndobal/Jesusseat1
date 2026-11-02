for(const form of document.querySelectorAll('[data-church-form]'))form.addEventListener('submit',async event=>{
 event.preventDefault();const button=form.querySelector('button[type=submit]'),status=form.querySelector('[role=status]');button.disabled=true;status.textContent='Sending…';
 try{const body=Object.fromEntries(new FormData(form));body.consent=body.consent==='on';const slug=form.dataset.base.split('/').at(-1);const r=await fetch(`/api/public/sites/${encodeURIComponent(slug)}/messages`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),data=await r.json();if(!r.ok)throw Error(data.error);status.textContent=`${data.message} Reference: ${data.reference}`;form.querySelectorAll('input,textarea,button').forEach(e=>e.disabled=true);}catch(e){status.textContent=e.message||'Unable to send. Please try again.';button.disabled=false;}
});
const gallery=[...document.querySelectorAll('[data-gallery-src]')],dialog=document.querySelector('.church-lightbox');let index=0;
function show(i){index=(i+gallery.length)%gallery.length;const item=gallery[index],img=dialog.querySelector('img');img.src=item.dataset.gallerySrc;img.alt=item.dataset.galleryAlt;dialog.querySelector('figcaption').textContent=item.dataset.galleryCaption;}
for(const [i,button] of gallery.entries())button.addEventListener('click',()=>{show(i);dialog.showModal();});
if(dialog){dialog.querySelector('[data-gallery-close]').addEventListener('click',()=>dialog.close());dialog.querySelector('[data-gallery-prev]').addEventListener('click',()=>show(index-1));dialog.querySelector('[data-gallery-next]').addEventListener('click',()=>show(index+1));dialog.addEventListener('keydown',e=>{if(!gallery.length)return;if(e.key==='ArrowLeft'){e.preventDefault();show(index-1);}if(e.key==='ArrowRight'){e.preventDefault();show(index+1);}});}

for(const player of document.querySelectorAll('[data-video-player]')){
 const stage=player.querySelector('.church-video-stage'),load=player.querySelector('[data-video-load]'),close=player.querySelector('[data-video-close]'),status=player.querySelector('[role=status]'),prompt=stage.firstElementChild;
 load.addEventListener('click',()=>{
  let url;try{url=new URL(load.dataset.videoSrc);}catch{return;}
  if(!((url.origin==='https://www.youtube-nocookie.com'&&/^\/embed\/[A-Za-z0-9_-]{11}$/.test(url.pathname))||(url.origin==='https://www.facebook.com'&&url.pathname==='/plugins/video.php')))return;
  const iframe=document.createElement('iframe');iframe.src=url.href;iframe.title=load.dataset.videoTitle;iframe.allow='encrypted-media; picture-in-picture; fullscreen';iframe.allowFullscreen=true;iframe.referrerPolicy='strict-origin-when-cross-origin';iframe.addEventListener('load',()=>{status.textContent='If the video does not play, use the provider link.';});prompt.hidden=true;stage.append(iframe);close.hidden=false;status.textContent='Loading video player…';iframe.focus();
 });
 close.addEventListener('click',()=>{stage.querySelector('iframe')?.remove();prompt.hidden=false;close.hidden=true;status.textContent='Player closed.';load.focus();});
}
