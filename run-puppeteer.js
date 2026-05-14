const puppeteer = require('puppeteer');

(async () => {
  console.log("Launching Puppeteer...");
  let browser;
  try {
    browser = await puppeteer.launch({ 
      executablePath: '/nix/store/0n9rl5l9syy808xi9bk4f6dhnfrvhkww-playwright-browsers-chromium/chromium-1080/chrome-linux/chrome',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] 
    });
  } catch(e) {
    console.log("Browser launch failed due to missing system dependencies.");
    console.log(e.message);
    process.exit(1);
  }

  const page = await browser.newPage();
  
  page.on('console', msg => console.log(`[BROWSER LOG] ${msg.text()}`));
  page.on('pageerror', err => console.log(`[BROWSER ERROR] ${err.message}`));
  
  console.log("Navigating to app...");
  try {
    // Vite server is running at http://localhost:5173
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle0', timeout: 20000 });
  } catch(e) {
    console.log("Navigation timeout - proceeding with current DOM state.");
  }
  
  const delay = (ms) => new Promise(r => setTimeout(r, ms));

  console.log("--- Initial State Check ---");
  const stage = await page.waitForSelector('.oracle-stage');
  const initialState = await page.evaluate(el => el.getAttribute('data-oracle-state'), stage);
  console.log(`State: ${initialState}`);

  console.log("--- Awakening Event ---");
  await stage.click();
  await delay(1000);
  const awakenedState = await page.evaluate(el => el.getAttribute('data-oracle-state'), stage);
  console.log(`State: ${awakenedState}`);

  console.log("--- Connect to Oracle ---");
  const cabinet = await page.waitForSelector('.oracle-cabinet');
  await cabinet.click();
  
  await delay(3000);
  
  const finalState = await page.evaluate(el => el.getAttribute('data-oracle-state'), stage);
  console.log(`State after connection attempt: ${finalState}`);
  
  console.log("--- DOM Evaluation ---");
  const hasError = await page.evaluate(() => !!document.querySelector('.oracle-error-toast'));
  if (hasError) {
    const errorText = await page.evaluate(() => document.querySelector('.oracle-error-toast span').innerText);
    console.log(`[Error Toast Present] ${errorText}`);
  }
  
  const hasTerminal = await page.evaluate(() => !!document.querySelector('.neural-link-terminal'));
  console.log(`Neural Link Terminal present: ${hasTerminal}`);
  
  // Trigger Auth
  console.log("--- Triggering Auth Event ---");
  await page.evaluate(() => {
    window.dispatchEvent(
      new CustomEvent('oracle:unlock', {
        detail: { trigger: 'squad_invite', userId: '123', sessionId: '456' },
      })
    );
  });
  await delay(1000);
  
  const hasTerminalNow = await page.evaluate(() => !!document.querySelector('.neural-link-terminal'));
  console.log(`Neural Link Terminal present after event: ${hasTerminalNow}`);
  if (hasTerminalNow) {
     const terminalText = await page.evaluate(() => document.querySelector('.neural-link-terminal h2').innerText);
     console.log(`Terminal header: ${terminalText}`);
  }

  await browser.close();
  process.exit(0);
})();
