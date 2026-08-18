import puppeteer from 'puppeteer';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname,'../screenshots');
const browser = await puppeteer.launch({ headless:true, executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
  args:['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']});
const page = await browser.newPage();
await page.setViewport({width:390,height:844});
await page.evaluateOnNewDocument((t)=>sessionStorage.setItem('oracle_gpu_profile_v1',JSON.stringify({tier:t,isMobile:true})),2);
await page.goto('http://localhost:80/surrogate-oracle',{waitUntil:'load',timeout:60000});
await new Promise(r=>setTimeout(r,4000));
await page.screenshot({path:join(OUT,'state-dormant.png')});
await page.click('.oracle-center');
await new Promise(r=>setTimeout(r,1500));
await page.evaluate(()=>window.__oracle_skipLore&&window.__oracle_skipLore());
await new Promise(r=>setTimeout(r,3500));
await page.screenshot({path:join(OUT,'state-awakened.png')});
await page.evaluate(()=>{const c=document.querySelector('.oracle-knife-card'); if(c)c.click();});
await new Promise(r=>setTimeout(r,9000));
const stage = await page.$('[data-oracle-state]');
// Force speaking states via attributes to exercise the CSS selectors
for (const [name, attrs] of [
  ['speaking', {'data-oracle-speaking':'true'}],
  ['user-speaking', {'data-user-speaking':'true'}],
]) {
  await page.evaluate((a)=>{const s=document.querySelector('[data-oracle-state]'); for(const [k,v] of Object.entries(a)) s.setAttribute(k,v);},attrs);
  await new Promise(r=>setTimeout(r,800));
  await page.screenshot({path:join(OUT,`state-${name}.png`)});
  await page.evaluate((a)=>{const s=document.querySelector('[data-oracle-state]'); for(const k of Object.keys(a)) s.removeAttribute(k);},attrs);
}
for (const cls of ['alignment-sacred','alignment-profane']) {
  await page.evaluate((c)=>document.querySelector('[data-oracle-state]').classList.add(c),cls);
  await new Promise(r=>setTimeout(r,1200));
  await page.screenshot({path:join(OUT,`state-${cls}.png`)});
  await page.evaluate((c)=>document.querySelector('[data-oracle-state]').classList.remove(c),cls);
}
console.log('done');
await browser.close();
