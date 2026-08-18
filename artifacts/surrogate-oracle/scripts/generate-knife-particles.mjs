#!/usr/bin/env node
/**
 * generate-knife-particles.mjs
 *
 * Pre-computes normalized glyph particle coordinates for all 5 knife questions.
 * Runs in headless Chromium so it samples the exact font typography metrics.
 * Output is saved to `src/data/knifeParticleData.ts`.
 *
 * Usage: node scripts/generate-knife-particles.mjs
 */

import puppeteer from 'puppeteer';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_FILE  = join(__dirname, '../src/data/knifeParticleData.ts');

const KNIFE_QUESTIONS = [
  {
    territory: 'THE LIBRARY OF ME',
    question: 'Who are you when the network goes dark and no one is watching?',
  },
  {
    territory: 'CONNECTION & DEBT',
    question: 'What do we owe to each other as our digital and physical selves and those around us?',
  },
  {
    territory: 'THE MACHINE MIRROR',
    question: "What would you ask this system to confirm that you already know but won't say out loud?",
  },
  {
    territory: 'THE SOCIAL CONSTRUCT',
    question: 'The version of you that lives online — when did it start making decisions for the real one?',
  },
  {
    territory: 'THE INDUSTRIAL QUESTION',
    question: 'What did you used to be able to do alone that you now need a machine to finish?',
  },
];

console.log('\n╔══════════════════════════════════════════╗');
console.log('║   PRE-BAKED KNIFE PARTICLE GENERATOR     ║');
console.log('╚══════════════════════════════════════════╝\n');

const browser = await puppeteer.launch({
  headless: true,
  executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || puppeteer.executablePath(),
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});

const page = await browser.newPage();

const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    @font-face {
      font-family: 'Orbitron';
      src: local('Orbitron');
    }
    body { margin: 0; background: #000; color: #fff; }
  </style>
</head>
<body>
  <canvas id="c" width="480" height="260"></canvas>
</body>
</html>
`;

await page.setContent(html);

const results = await page.evaluate((questions) => {
  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const W = 480;
  const H = 260;

  const dataset = [];

  for (let qIdx = 0; qIdx < questions.length; qIdx++) {
    const { territory, question } = questions[qIdx];
    ctx.clearRect(0, 0, W, H);

    // Layout typography inside 480x260 card
    // Territory header at top
    ctx.font = 'bold 15px monospace, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(territory, W / 2, 22);

    // Question body with word wrapping
    const words = question.split(' ');
    const fontSize = 17;
    const lineHeight = 26;
    ctx.font = '600 17px monospace, sans-serif';
    ctx.textAlign = 'left';

    const maxLineWidth = 410;
    const lines = [];
    let currentLine = [];
    let currentWidth = 0;

    for (let w = 0; w < words.length; w++) {
      const word = words[w];
      const wordW = ctx.measureText(word + ' ').width;
      if (currentWidth + wordW > maxLineWidth && currentLine.length > 0) {
        lines.push(currentLine);
        currentLine = [{ word, idx: w }];
        currentWidth = wordW;
      } else {
        currentLine.push({ word, idx: w });
        currentWidth += wordW;
      }
    }
    if (currentLine.length > 0) lines.push(currentLine);

    // Render word by word and tag points with wordIndex & charIndex
    const startY = 75;
    const questionPoints = [];

    let globalCharOffset = 0;

    for (let l = 0; l < lines.length; l++) {
      const line = lines[l];
      const totalLineWidth = line.reduce((acc, item) => acc + ctx.measureText(item.word + ' ').width, 0);
      let curX = (W - totalLineWidth) / 2;
      const curY = startY + l * lineHeight;

      for (let item of line) {
        const { word, idx: wordIdx } = item;
        const wordStartChar = globalCharOffset;

        // Render this word
        ctx.clearRect(0, 0, W, H);
        ctx.font = '600 17px monospace, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(word, curX, curY);

        const imgData = ctx.getImageData(0, 0, W, H).data;
        const step = 3; // 3px sampling grid

        for (let y = curY - 2; y < curY + lineHeight + 2; y += step) {
          for (let x = curX - 2; x < curX + ctx.measureText(word).width + 2; x += step) {
            const ix = Math.floor(x);
            const iy = Math.floor(y);
            if (ix < 0 || ix >= W || iy < 0 || iy >= H) continue;
            const alpha = imgData[(iy * W + ix) * 4 + 3];
            if (alpha > 70) {
              // Estimate char index within word based on relative x position
              const relX = (x - curX) / Math.max(1, ctx.measureText(word).width);
              const charInWord = Math.min(word.length - 1, Math.floor(relX * word.length));
              const charIdx = wordStartChar + charInWord;

              questionPoints.push([
                Math.round((x / W) * 1000) / 1000,
                Math.round((y / H) * 1000) / 1000,
                wordIdx,
                charIdx,
              ]);
            }
          }
        }

        const wordW = ctx.measureText(word + ' ').width;
        curX += wordW;
        globalCharOffset += word.length + 1;
      }
    }

    // Also extract territory header points (wordIdx = -1, charIdx = -1)
    ctx.clearRect(0, 0, W, H);
    ctx.font = 'bold 15px monospace, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(territory, W / 2, 22);
    const terrData = ctx.getImageData(0, 0, W, 60).data;
    const terrPoints = [];

    for (let y = 15; y < 50; y += 3) {
      for (let x = 30; x < W - 30; x += 3) {
        const ix = Math.floor(x);
        const iy = Math.floor(y);
        const alpha = terrData[(iy * W + ix) * 4 + 3];
        if (alpha > 70) {
          terrPoints.push([
            Math.round((x / W) * 1000) / 1000,
            Math.round((y / H) * 1000) / 1000,
            -1,
            -1,
          ]);
        }
      }
    }

    dataset.push({
      territory,
      question,
      totalWords: words.length,
      totalChars: question.length,
      territoryPoints: terrPoints,
      questionPoints,
    });
  }

  return dataset;
}, KNIFE_QUESTIONS);

await browser.close();

console.log(`  Extracted particle points for ${results.length} knife questions:`);
for (let i = 0; i < results.length; i++) {
  const q = results[i];
  console.log(`    [${i + 1}] ${q.territory}: ${q.territoryPoints.length} title pts, ${q.questionPoints.length} body pts`);
}

const fileContent = `/**
 * knifeParticleData.ts
 *
 * Pre-baked normalized glyph particle coordinates for all 5 knife questions.
 * Auto-generated by scripts/generate-knife-particles.mjs.
 *
 * Format per particle point: [x (0..1), y (0..1), wordIndex, charIndex]
 */

export interface KnifeParticleQuestion {
  territory: string;
  question: string;
  totalWords: number;
  totalChars: number;
  /** Points for the territory title header (wordIndex = -1) */
  territoryPoints: Array<[number, number, number, number]>;
  /** Points for the question body */
  questionPoints: Array<[number, number, number, number]>;
}

export const KNIFE_PARTICLE_DATA: KnifeParticleQuestion[] = ${JSON.stringify(results, null, 2)};
`;

writeFileSync(OUT_FILE, fileContent, 'utf8');
console.log(`\n  ✅ Successfully written: src/data/knifeParticleData.ts\n`);
