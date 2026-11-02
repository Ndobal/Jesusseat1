import { fail } from './security.js';
// Decode only bounded raster formats. No SVG, HTML, external fetches or caller-supplied MIME.
export function imageBytes(encoded) {
 if(typeof encoded!=='string'||encoded.length>2100000||!encoded.length||encoded.length%4||!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded))fail(400,'Choose a PNG or JPEG image under 1.5 MB.');
 const data=Buffer.from(encoded,'base64');if(data.toString('base64')!==encoded||data.length>1572864)fail(400,'Invalid image or image too large.');
 let mime,width,height,clean;
 if(data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) {
  mime='image/png';let at=8,ended=false,hasData=false,header=false;const chunks=[data.subarray(0,8)];
  const crc=b=>{let c=0xffffffff;for(const v of b){c^=v;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;};
  while(at+12<=data.length){const n=data.readUInt32BE(at);if(n>data.length-at-12)fail(400,'Invalid PNG.');const type=data.toString('ascii',at+4,at+8),end=at+12+n;
   if(crc(data.subarray(at+4,end-4))!==data.readUInt32BE(end-4))fail(400,'Invalid PNG checksum.');
   if(!header){if(type!=='IHDR'||n!==13)fail(400,'Invalid PNG header.');width=data.readUInt32BE(at+8);height=data.readUInt32BE(at+12);header=true;}
   else if(type==='IHDR')fail(400,'Invalid PNG header.');
   if(type==='acTL')fail(400,'Choose a still image.');if(type==='IDAT')hasData=true;
   if(['IHDR','PLTE','IDAT','IEND','tRNS','gAMA','sRGB','cHRM'].includes(type))chunks.push(data.subarray(at,end));
   else if(type[0]===type[0].toUpperCase())fail(400,'Unsupported PNG format.');
   at=end;if(type==='IEND'){if(n!==0||at!==data.length)fail(400,'Invalid PNG ending.');ended=true;break;}
  }
  if(!ended||!hasData)fail(400,'Incomplete PNG.');clean=Buffer.concat(chunks);
 }else if(data[0]===255&&data[1]===216){
  mime='image/jpeg';let at=2,scan=false,ended=false;const chunks=[data.subarray(0,2)];
  while(at<data.length){if(data[at]!==255)fail(400,'Invalid JPEG.');const start=at;while(data[at]===255)at++;const marker=data[at++];
   if(marker===217){chunks.push(Buffer.from([255,217]));ended=true;if(at!==data.length)fail(400,'Unexpected image data.');break;}
   if(marker===0||marker===216||(marker>=208&&marker<=215)||at+2>data.length)fail(400,'Invalid JPEG marker.');
   const length=data.readUInt16BE(at);if(length<2||at+length>data.length)fail(400,'Invalid JPEG length.');
   if([192,194].includes(marker)){if(length<8)fail(400,'Invalid JPEG frame.');height=data.readUInt16BE(at+3);width=data.readUInt16BE(at+5);}
   else if(marker>=193&&marker<=207&&![196,200,204].includes(marker))fail(400,'Unsupported JPEG format.');
   if(!(marker>=224&&marker<=239)&&marker!==254)chunks.push(data.subarray(start,at+length));
   at+=length;
   if(marker===218){scan=true;const begin=at;while(at<data.length){if(data[at]!==255){at++;continue;}if(data[at+1]===0||(data[at+1]>=208&&data[at+1]<=215)){at+=2;continue;}break;}chunks.push(data.subarray(begin,at));}
  }
  if(!ended||!scan)fail(400,'Incomplete JPEG.');clean=Buffer.concat(chunks);
 }else fail(400,'Only PNG and JPEG images are supported.');
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>6000||height>6000||width*height>24000000)fail(400,'Image dimensions must fit within 6000 pixels and 24 megapixels.');
 return {data:clean,mime,width,height,size:clean.length};
}
