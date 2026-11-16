#!/usr/bin/env node
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

function loadServiceAccount() {
  const arg = process.argv[2];
  if (arg && fs.existsSync(arg)) return require(path.resolve(arg));
  const env = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (env && fs.existsSync(env)) return require(path.resolve(env));
  console.error('Service account JSON not found. Set GOOGLE_APPLICATION_CREDENTIALS or pass path as first arg.');
  process.exit(2);
}

async function main() {
  const sa = loadServiceAccount();
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(sa),
      databaseURL: sa.databaseURL || 'https://capstone-d5b64-default-rtdb.asia-southeast1.firebasedatabase.app'
    });
  }
  const db = admin.database();
  const ref = db.ref('/pendingAttendance/archived');
  const snap = await ref.once('value');
  if (!snap.exists()) {
    console.log('No /pendingAttendance/archived node found.');
    process.exit(0);
  }
  const val = snap.val();
  const keys = Object.keys(val || {});
  console.log('Found', keys.length, 'entries under /pendingAttendance/archived');
  const malformed = [];
  for (const k of keys) {
    const v = val[k];
    const t = typeof v;
    const isObject = v && t === 'object' && !Array.isArray(v);
    // Consider malformed if not an object or contains non-standard fields
    if (!isObject) {
      malformed.push({ key: k, type: t, value: v });
      continue;
    }
    // If object has keys that look like flattened fields (ends with '_userId' etc), mark malformed
    const subKeys = Object.keys(v);
    const looksFlattened = subKeys.every(sk => /2025_\d{2}_\d{2}_(userId|facultyId|status|time|timestamp|type)/.test(sk));
    if (looksFlattened) {
      malformed.push({ key: k, type: 'flattened-object', subKeysCount: subKeys.length, sampleSubKeys: subKeys.slice(0,10) });
    }
  }

  if (malformed.length === 0) {
    console.log('No malformed archived entries found.');
  } else {
    console.log('Malformed archived entries:');
    malformed.forEach(m => console.log(JSON.stringify(m, null, 2)));
  }
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(3); });
