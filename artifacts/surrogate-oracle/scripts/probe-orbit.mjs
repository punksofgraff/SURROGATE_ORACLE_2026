import puppeteer from 'puppeteer';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname,'../screenshots');
const TIER = parseInt(process.argv[2] || '2', 10);

const browser = await puppeteer.launch({ headless:true, executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
  args:['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']});
const page = await browser.newPage();
await page.setViewport({width:390,height:844});
await page.evaluateOnNewDocument((t)=>sessionStorage.setItem('oracle_gpu_profile_v1',JSON.stringify({tier:t,isMobile:true})),TIER);
await page.goto('http://localhost:80/surrogate-oracle',{waitUntil:'load',timeout:60000});
await new Promise(r=>setTimeout(r,5000));
await page.click('.oracle-center');
await new Promise(r=>setTimeout(r,1500));
await page.evaluate(()=>window.__oracle_skipLore&&window.__oracle_skipLore());
await new Promise(r=>setTimeout(r,3500));
await page.evaluate(()=>{const c=document.querySelector('.oracle-knife-card'); if(c)c.click();});
await new Promise(r=>setTimeout(r,9000));
const phase=await page.$eval('[data-oracle-state]',el=>el.getAttribute('data-oracle-state')).catch(()=>null);
const dims = await page.evaluate(()=>{
  const r=(el)=>{if(!el)return null;const b=el.getBoundingClientRect();return {w:Math.round(b.width),h:Math.round(b.height),x:Math.round(b.x),y:Math.round(b.y)};};
  const cv=document.querySelector('.oracle-avatar-canvas canvas');
  return {wrapper:r(document.querySelector('.oracle-avatar-wrapper')),
          glCanvas:r(cv),
          bufferPx: cv ? cv.width*cv.height : 0,
          overlays: {monitorCast: !!document.querySelector('.oracle-monitor-cast')}};
});
const shotA = join(OUT,`orbit-t${TIER}-a.png`);
const shotB = join(OUT,`orbit-t${TIER}-b.png`);
await page.screenshot({path:shotA});
await new Promise(r=>setTimeout(r,1100));
await page.screenshot({path:shotB});

// pixel diff in a blank page
const diffPage = await browser.newPage();
const b64 = p => readFileSync(p).toString('base64');
const diff = await diffPage.evaluate(async (a,b)=>{
  const load = s => new Promise((res,rej)=>{const i=new Image(); i.onload=()=>res(i); i.onerror=rej; i.src='data:image/png;base64,'+s;});
  const [ia,ib] = await Promise.all([load(a),load(b)]);
  const w=ia.width,h=ia.height;
  const cv=(img)=>{const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');x.drawImage(img,0,0);return x.getImageData(0,0,w,h).data;};
  const da=cv(ia),db=cv(ib);
  // zones: full frame, and particle zones = left & right strips outside center avatar column, mid band
  const zones = {full:[0,0,w,h], left:[0,Math.round(h*0.3),Math.round(w*0.18),Math.round(h*0.5)], right:[Math.round(w*0.82),Math.round(h*0.3),Math.round(w*0.18),Math.round(h*0.5)]};
  const out={};
  for (const [name,[zx,zy,zw,zh]] of Object.entries(zones)) {
    let changed=0,total=0;
    for(let y=zy;y<zy+zh;y+=2) for(let x=zx;x<zx+zw;x+=2){
      const i=(y*w+x)*4;
      const d=Math.abs(da[i]-db[i])+Math.abs(da[i+1]-db[i+1])+Math.abs(da[i+2]-db[i+2]);
      if(d>24) changed++;
      total++;
    }
    out[name]={changedPct:+(100*changed/total).toFixed(2)};
  }
  return out;
}, b64(shotA), b64(shotB));

console.log(JSON.stringify({tier:TIER, phase, dims, diff}, null, 1));
await browser.close();
