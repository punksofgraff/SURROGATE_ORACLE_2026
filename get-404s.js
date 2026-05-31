const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ 
    executablePath: '/nix/store/0n9rl5l9syy808xi9bk4f6dhnfrvhkww-playwright-browsers-chromium/chromium-1080/chrome-linux/chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox'] 
  });
  const page = await browser.newPage();
  
  page.on('response', response => {
    if (response.status() === 404) {
      console.log('404:', response.url());
    }
  });

  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('Error:', msg.text());
    }
  });

  await page.goto('http://localhost:5173', { waitUntil: 'networkidle0', timeout: 10000 }).catch(e => console.log('Timeout'));
  await browser.close();
  process.exit(0);
})();
