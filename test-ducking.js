const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ 
    executablePath: '/nix/store/0n9rl5l9syy808xi9bk4f6dhnfrvhkww-playwright-browsers-chromium/chromium-1080/chrome-linux/chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox'] 
  });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('[BROWSER]', msg.text()));

  await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' });

  // 1. Initial State
  const vol0 = await page.evaluate(() => {
    const audio = document.querySelector('audio');
    const stage = document.querySelector('.oracle-stage');
    return audio ? { vol: audio.volume, target: stage ? stage.dataset.audioTargetVol : 'no stage' } : 'no audio';
  });
  console.log('Initial State:', JSON.stringify(vol0));

  // 2. Click to Awaken
  await page.waitForSelector('.oracle-stage');
  await page.click('.oracle-stage');
  await new Promise(r => setTimeout(r, 1000));
  await page.evaluate(() => { if (window.__oracle_skipLore) window.__oracle_skipLore(); });
  await new Promise(r => setTimeout(r, 2000));

  const vol1 = await page.evaluate(() => {
    const audio = document.querySelector('audio');
    const stage = document.querySelector('.oracle-stage');
    return audio ? { vol: audio.volume, target: stage ? stage.dataset.audioTargetVol : 'no stage' } : 'no audio';
  });
  console.log('Awakened State:', JSON.stringify(vol1));

  // 3. Skip Lore -> Knife -> Oracle
  await page.waitForSelector('.oracle-knife-card');
  await page.click('.oracle-knife-card');
  await new Promise(r => setTimeout(r, 3000)); // Wait for connection

  const vol2 = await page.evaluate(() => {
    const audio = document.querySelector('audio');
    const stage = document.querySelector('.oracle-stage');
    return audio ? { vol: audio.volume, target: stage ? stage.dataset.audioTargetVol : 'no stage' } : 'no audio';
  });
  console.log('Oracle State:', JSON.stringify(vol2));
  
  await page.click('.oc-signal-pad-toggle');
  await page.type('.oc-input', 'Hello Oracle');
  await page.keyboard.press('Enter');

  console.log('Waiting for Oracle speaking...');
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 500));
    const speakingData = await page.evaluate(() => {
      const stage = document.querySelector('.oracle-stage');
      const isSpeaking = stage ? stage.dataset.oracleSpeaking === 'true' : false;
      const targetVol = stage ? stage.dataset.audioTargetVol : null;
      return { isSpeaking, targetVol };
    });
    if (speakingData.isSpeaking) {
      console.log('SPEAKING DETECTED:', JSON.stringify(speakingData));
      // wait a bit for the fade
      await new Promise(r => setTimeout(r, 600));
      const finalTarget = await page.evaluate(() => {
        const stage = document.querySelector('.oracle-stage');
        return stage ? stage.dataset.audioTargetVol : null;
      });
      console.log('Final Target Volume:', finalTarget);
      break;
    }
  }

  await browser.close();
})();
