const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  
  const logs = [];
  page.on('console', msg => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => logs.push(`[PAGE ERROR] ${err.message}`));
  
  console.log("Navigating to local dev server...");
  try {
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
  } catch(e) {
    console.log("Failed to load page. Is the dev server running?");
    await browser.close();
    process.exit(1);
  }

  console.log("--- Initial State Check ---");
  const stage = await page.waitForSelector('.oracle-stage');
  const initialState = await stage.getAttribute('data-oracle-state');
  console.log(`State: ${initialState}`);

  console.log("--- Awakening Event ---");
  await stage.click();
  await page.waitForTimeout(1000);
  const awakenedState = await stage.getAttribute('data-oracle-state');
  console.log(`State: ${awakenedState}`);

  console.log("--- Connect to Oracle ---");
  const cabinet = await page.waitForSelector('.oracle-cabinet', { state: 'visible' });
  await cabinet.click();
  
  // Wait for the connection animation to start and possibly fail or succeed
  await page.waitForTimeout(3000);
  
  const finalState = await stage.getAttribute('data-oracle-state');
  console.log(`State after connection attempt: ${finalState}`);
  
  console.log("--- DOM Evaluation ---");
  const hasError = await page.evaluate(() => !!document.querySelector('.oracle-error-toast'));
  if (hasError) {
    const errorText = await page.evaluate(() => document.querySelector('.oracle-error-toast span').innerText);
    console.log(`[Error Toast Present] ${errorText}`);
  }
  
  const hasAuth = await page.evaluate(() => !!document.querySelector('.neural-link-terminal'));
  console.log(`Neural Link Terminal present: ${hasAuth}`);

  console.log("--- Browser Console Logs ---");
  logs.forEach(l => console.log(l));

  await browser.close();
})();