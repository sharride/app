const fs = require('fs');
const path = require('path');

const fonts = [
  'public/fonts/Inter-Regular.woff2',
  'public/fonts/Inter-SemiBold.woff2',
  'public/fonts/Cairo-Regular.woff2',
  'public/fonts/Cairo-Bold.woff2',
];

let missing = [];
for (const f of fonts) {
  if (!fs.existsSync(path.resolve(__dirname, '..', f))) missing.push(f);
}

if (missing.length) {
  console.error('Missing font files:');
  for (const m of missing) console.error(' -', m);
  console.error('\nPlace licensed WOFF2 files in public/fonts/ and re-run.');
  process.exit(2);
}
console.log('All required font files present.');
