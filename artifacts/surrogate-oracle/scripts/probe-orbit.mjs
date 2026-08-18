import puppeteer from 'puppeteer';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname,'../screenshots');
const browser = await puppeteer.launch({ headless:true, executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
  args:['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--use-file-for-fake-audio-capture='+join(__dirname,'../public/mock-speech.wav')]});
const page = await browser.newPage();
await page.setViewport({width:390,height:844});
await page.evaluateOnNewDocument((t)=>sessionStorage.setItem('oracle_gpu_profile_v1',JSON.stringify({tier:t,isMobile:true})),2);
await page.goto('http://localhost:80/surrogate-oracle',{waitUntil:'load',timeout:60000});
await new Promise(r=>setTimeout(r,5000));
await page.click('.oracle-center');
await new Promise(r=>setTimeout(r,1500));
await page.evaluate(()=>window.__oracle_skipLore&&window.__oracle_skipLore());
await new Promise(r=>setTimeout(r,3500));
await page.evaluate(()=>{const c=document.querySelector('.oracle-knife-card'); if(c)c.click();});
await new Promise(r=>setTimeout(r,9000));
const phase=await page.$eval('[data-oracle-state]',el=>el.getAttribute('data-oracle-state')).catch(()=>null);
// measure canvas box vs wrapper box
const dims = await page.evaluate(()=>{
  const w=document.querySelector('.oracle-avatar-wrapper');
  const c=document.querySelector('.oracle-avatar-canvas');
  const cv=document.querySelector('.oracle-avatar-canvas canvas');
  const r=(el)=>{if(!el)return null;const b=el.getBoundingClientRect();return {w:Math.round(b.width),h:Math.round(b.height),x:Math.round(b.x),y:Math.round(b.y)};};
  return {wrapper:r(w), canvasDiv:r(c), glCanvas:r(cv)};
});
console.log('phase:',phase);
console.log('dims:',JSON.stringify(dims));
await page.screenshot({path:join(OUT,'probe-orbit.png')});
console.log('done');
await browser.close();
