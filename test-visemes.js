const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ 
    executablePath: '/nix/store/0n9rl5l9syy808xi9bk4f6dhnfrvhkww-playwright-browsers-chromium/chromium-1080/chrome-linux/chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox'] 
  });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('[BROWSER]', msg.text()));

  await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' });
  console.log('Navigated.');

  // 1. Awaken
  await page.waitForSelector('.oracle-stage');
  await page.click('.oracle-stage');
  console.log('Clicked stage.');
  await new Promise(r => setTimeout(r, 1000));
  await page.evaluate(() => { if (window.__oracle_skipLore) window.__oracle_skipLore(); });
  console.log('Skipped lore.');
  await new Promise(r => setTimeout(r, 2000));
  
  // 2. Select Knife
  await page.waitForSelector('.oracle-knife-card');
  await page.click('.oracle-knife-card');
  console.log('Selected knife.');
  await new Promise(r => setTimeout(r, 2000));

  // 3. Check for viseme data-attributes
  const visemeData = await page.evaluate(() => {
    const el = document.querySelector('.oracle-avatar-smoke-hook');
    if (!el) return 'element not found';
    return {
      viseme: el.dataset.viseme,
      amplitude: el.dataset.amplitude
    };
  });
  console.log('Viseme Data (Initial Oracle State):', JSON.stringify(visemeData));

  // 4. Send a message to trigger Oracle response
  await page.click('.oc-signal-pad-toggle');
  await page.type('.oc-input', 'Hello Oracle');
  await page.keyboard.press('Enter');

  console.log('Waiting for Oracle response...');
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 500));
    const liveViseme = await page.evaluate(() => {
      const el = document.querySelector('.oracle-avatar-smoke-hook');
      return el ? { v: el.dataset.viseme, a: el.dataset.amplitude } : null;
    });
    if (liveViseme && parseFloat(liveViseme.a) > 0.05) {
      console.log('LIVE VISEME DETECTED:', JSON.stringify(liveViseme));
      break;
    }
  }

  await browser.close();
})();
