#!/usr/bin/env node
import fs from 'node:fs';

const [, , inputPath, outputPath, target] = process.argv;
if (!inputPath || !outputPath || !target) {
  console.error('Usage: manifest-target.mjs <input> <output> <target>');
  process.exit(1);
}

const raw = fs.readFileSync(inputPath, 'utf8');
const manifest = JSON.parse(raw);

if (!['chromium', 'firefox', 'opera'].includes(target)) {
  console.error(`Unsupported target: ${target}`);
  process.exit(1);
}

if (target === 'firefox') {
  manifest.browser_specific_settings = manifest.browser_specific_settings ?? {
    gecko: {
      id: 'manga-tracker-sync@mangalist.app',
    },
  };
} else {
  delete manifest.browser_specific_settings;
}

fs.writeFileSync(outputPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
