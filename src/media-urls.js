import { fail, text } from './security.js';
export function videoUrl(value){
 const raw=text(value,'YouTube or Facebook video link',10,1000);let u;try{u=new URL(raw);}catch{fail(400,'Paste a complete HTTPS video link.');}
 if(u.protocol!=='https:'||u.username||u.password||u.port)fail(400,'Use an HTTPS video link without credentials or a custom port.');
 const host=u.hostname.toLowerCase(),parts=u.pathname.split('/').filter(Boolean);let provider,videoId;
 if(['youtube.com','www.youtube.com','m.youtube.com','youtu.be','www.youtube-nocookie.com'].includes(host)){
  provider='youtube';if(host==='youtu.be'&&parts.length===1)videoId=parts[0];else if(u.pathname==='/watch'&&u.searchParams.getAll('v').length===1)videoId=u.searchParams.get('v');else if(parts.length===2&&['embed','live','shorts'].includes(parts[0]))videoId=parts[1];
  if(!/^[A-Za-z0-9_-]{11}$/.test(videoId||''))fail(400,'Use a YouTube video, Shorts or live video link, rather than a channel or playlist link.');
  return {provider,videoId,url:'https://www.youtube.com/watch?v='+videoId,embedUrl:'https://www.youtube-nocookie.com/embed/'+videoId+'?playsinline=1'};
 }
 if(['facebook.com','www.facebook.com','m.facebook.com','web.facebook.com'].includes(host)){
  provider='facebook';if((u.pathname==='/watch/'||u.pathname==='/watch'||u.pathname==='/video.php')&&u.searchParams.getAll('v').length===1)videoId=u.searchParams.get('v');else if(parts.length===3&&parts[1]==='videos')videoId=parts[2];
  if(!/^[0-9]{5,30}$/.test(videoId||''))fail(400,'Copy the full Facebook video permalink. Shortened share links, profiles and posts are not supported.');
  const url='https://www.facebook.com/watch/?v='+videoId;return {provider,videoId,url,embedUrl:'https://www.facebook.com/plugins/video.php?href='+encodeURIComponent(url)+'&show_text=false&width=1280'};
 }
 fail(400,'Choose a YouTube or Facebook video link.');
}
export function siteVideo(value){if(value==null||value==='')return null;if(typeof value!=='object'||Array.isArray(value)||!['live','replay','upcoming'].includes(value.mode))fail(400,'Choose live service, replay or upcoming service.');return {url:videoUrl(value.url).url,mode:value.mode};}
export const playerName=p=>p==='youtube'?'YouTube':'Facebook';
