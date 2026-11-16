const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const src = path.join(projectRoot, '.htaccess');
const dist = path.join(projectRoot, 'dist');
const dest = path.join(dist, '.htaccess');

try {
  if (!fs.existsSync(src)) {
    console.warn('.htaccess not found at project root; skipping copy.');
    process.exit(0);
  }
  if (!fs.existsSync(dist)) {
    console.warn('Dist folder not found; have you run `npm run build`?');
    // still attempt to create dist directory
    try { fs.mkdirSync(dist, { recursive: true }); } catch (e) { /* ignore */ }
  }
  fs.copyFileSync(src, dest);
  console.log('.htaccess copied to', dest);
} catch (err) {
  console.error('Failed to copy .htaccess to dist:', err);
  process.exit(1);
}
