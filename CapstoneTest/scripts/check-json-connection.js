#!/usr/bin/env node
const fs = require('fs');
// path already required below via __dirname path usage
const path = require('path');

function usage() {
  console.log('Usage: node scripts/check-json-connection.js --file <path-to-json>');
  process.exit(2);
}

const argv = require('minimist')(process.argv.slice(2));
const file = argv.file || argv.f;
if (!file) usage();

if (!fs.existsSync(file)) {
  console.error('File not found:', file);
  process.exit(1);
}

let raw;
try { raw = fs.readFileSync(file, 'utf8'); } catch (e) { console.error('Failed to read file:', e.message); process.exit(1); }
let data;
try { data = JSON.parse(raw); } catch (e) { console.error('Not valid JSON:', e.message); process.exit(1); }

const topKeys = Object.keys(data || {});
console.log('\nJSON file:', file);
console.log('Top-level keys found:', topKeys.join(', ') || '<none>');

// Search workspace for references to filename and top-level keys
const workspaceRoot = path.resolve(__dirname, '..');
console.log('\nSearching project files under:', workspaceRoot);

function walkDir(dir, exts = ['.js', '.jsx', '.ts', '.tsx', '.md', '.json', '.py', '.sh', '.php', '.html']) {
  const results = [];
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    let items = [];
    try { items = fs.readdirSync(cur, { withFileTypes: true }); } catch (e) { continue; }
    for (const it of items) {
      if (it.name === 'node_modules' || it.name === '.git' || it.name === '_backups') continue;
      const full = path.join(cur, it.name);
      if (it.isDirectory()) stack.push(full);
      else if (it.isFile()) {
        if (exts.includes(path.extname(it.name))) results.push(full);
      }
    }
  }
  return results;
}

async function searchPattern(pattern) {
  // pattern not used; return all files matching common extensions
  return walkDir(workspaceRoot);
}

async function grepString(str) {
  const matches = [];
  const files = await searchPattern('**/*.{js,jsx,ts,tsx,md,json,py,sh,php,html}');
  for (const f of files) {
    try {
      const content = fs.readFileSync(f, 'utf8');
      if (content.indexOf(str) !== -1) matches.push(f);
    } catch (e) { /* ignore read errors */ }
  }
  return matches;
}

(async () => {
  const basename = path.basename(file);
  const filenameMatches = await grepString(basename);
  if (filenameMatches.length === 0) {
    console.log(`\nNo files reference the filename '${basename}' directly.`);
  } else {
    console.log(`\nFiles that reference filename '${basename}':`);
    filenameMatches.forEach(f => console.log('  -', path.relative(workspaceRoot, f)));
  }

  // Search for top-level key mentions
  const keyUsage = {};
  for (const key of topKeys) {
    const occurrences = await grepString(key);
    keyUsage[key] = occurrences;
  }

  console.log('\nTop-level key usage summary:');
  for (const k of topKeys) {
    const list = keyUsage[k] || [];
    if (list.length === 0) {
      console.log(`  - ${k}: not referenced in project files`);
    } else {
      console.log(`  - ${k}: referenced in ${list.length} file(s)`);
      list.slice(0, 10).forEach(f => console.log('     -', path.relative(workspaceRoot, f)));
      if (list.length > 10) console.log('     -', `...and ${list.length - 10} more`);
    }
  }

  // Quick heuristic: check if any firebase upload/transform scripts expect other filenames
  const scriptFiles = await searchPattern('scripts/*.js');
  const scriptsMentioning = [];
  for (const s of scriptFiles) {
    try {
      const txt = fs.readFileSync(s, 'utf8');
      if (/capstone-d5b64/.test(txt)) scriptsMentioning.push(path.relative(workspaceRoot, s));
    } catch (e) {}
  }

  console.log('\nScripts referencing other capstone export filenames:');
  if (scriptsMentioning.length === 0) {
    console.log('  - none found');
  } else {
    scriptsMentioning.forEach(s => console.log('  -', s));
  }

  // Recommendation
  console.log('\nRecommendations:');
  if (filenameMatches.length === 0) {
    console.log('  - The provided JSON is not referenced directly by project files.');
    console.log('  - To use it with the provided scripts, either rename or copy it to the expected filename used by scripts (e.g. capstone-d5b64-redesigned-updated.json or capstone-d5b64-default-rtdb-export-normalized.json).');
  } else {
    console.log('  - The JSON filename is referenced directly by project files above. No filename change needed.');
  }

  // Summarize how data is consumed
  console.log('\nHow the app consumes the data at runtime:');
  console.log('  - The web app components and services read data at runtime from Firebase Realtime Database via the firebaseService API (no local JSON is read during normal app runs).');
  console.log('  - Upload/import scripts under the `scripts/` folder are used to write JSON exports into Firebase; those scripts determine which local filenames they expect.');

  process.exit(0);
})();
