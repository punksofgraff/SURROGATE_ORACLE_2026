const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ 
    executablePath: '/nix/store/0n9rl5l9syy808xi9bk4f6dhnfrvhkww-playwright-browsers-chromium/chromium-1080/chrome-linux/chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox'] 
  });
  const page = await browser.newPage();
  
  page.on('console', msg => {
    console.log('[' + msg.type().toUpperCase() + '] ' + msg.text());
  });

  page.on('pageerror', err => {
    console.log('[PAGE ERROR] ' + err.toString());
  });

  console.log('--- NAVIGATING TO APP ---');
  await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 2000));

  console.log('--- TRIGGERING AWAKENING ---');
  await page.click('.oracle-stage');
  await new Promise(r => setTimeout(r, 1000));
  await page.evaluate(() => { if (window.__oracle_skipLore) window.__oracle_skipLore(); });
  await new Promise(r => setTimeout(r, 2000));

  console.log('--- SELECTING KNIFE ---');
  await page.waitForSelector('.oracle-knife-card');
  await page.click('.oracle-knife-card');
  await new Promise(r => setTimeout(r, 5000));

  console.log('--- SENDING MESSAGE ---');
  await page.click('.oc-signal-pad-toggle');
  await page.type('.oc-input', 'Please speak to test muting.');
  await page.keyboard.press('Enter');

  console.log('--- WAITING FOR SPEECH ---');
  for (let i = 0; i < 30; i++) {
     await new Promise(r => setTimeout(r, 500));
     const data = await page.evaluate(() => {
        const stage = document.querySelector('.oracle-stage');
        const audio = document.querySelector('audio');
        return {
           speaking: stage.dataset.oracleSpeaking === 'true',
           targetVol: stage.dataset.audioTargetVol,
           actualMuted: audio ? audio.muted : 'no audio'
        };
     });
     if (data.speaking) {
        console.log('--- SPEAKING: ' + JSON.stringify(data) + ' ---');
     }
  }

  console.log('--- TEST COMPLETE ---');
  await browser.close();
  process.exit(0);
})();
