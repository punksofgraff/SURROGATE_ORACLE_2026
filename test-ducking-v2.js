const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ 
    executablePath: '/nix/store/0n9rl5l9syy808xi9bk4f6dhnfrvhkww-playwright-browsers-chromium/chromium-1080/chrome-linux/chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox'] 
  });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('[BROWSER]', msg.text()));

  await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.oracle-stage');

  // 1. Awaken
  await page.click('.oracle-stage');
  await new Promise(r => setTimeout(r, 1000));
  await page.evaluate(() => { if (window.__oracle_skipLore) window.__oracle_skipLore(); });
  await new Promise(r => setTimeout(r, 2000));

  // 2. Select Knife
  await page.waitForSelector('.oracle-knife-card');
  await page.click('.oracle-knife-card');
  await new Promise(r => setTimeout(r, 3000));

  console.log('--- ENTERING SPEAKING TEST ---');

  // 3. Trigger "Speaking" and check volume
  await page.evaluate(() => {
    // Force a speaking state to trigger the useEffect
    const event = new CustomEvent('oracle:alignment', { detail: { alignment: 'sacred' } });
    window.dispatchEvent(event);
  });

  await page.click('.oc-signal-pad-toggle');
  await page.type('.oc-input', 'Say a long sentence so I can check ducking.');
  await page.keyboard.press('Enter');

  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 500));
    const data = await page.evaluate(() => {
      const audio = document.querySelector('audio');
      const stage = document.querySelector('.oracle-stage');
      const isSpeaking = stage.dataset.oracleSpeaking === 'true';
      return { 
        isSpeaking, 
        targetVol: stage.dataset.audioTargetVol,
        actualVol: audio ? audio.volume : 'no audio'
      };
    });
    if (data.isSpeaking) {
      console.log('SPEAKING:', JSON.stringify(data));
    }
  }

  await browser.close();
})();
