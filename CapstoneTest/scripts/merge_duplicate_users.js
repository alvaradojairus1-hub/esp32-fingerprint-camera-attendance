#!/usr/bin/env node
/*
 Find duplicate users by email and optionally merge them into a canonical node.
 Dry-run by default: prints duplicates and suggested merges.
 To apply: set APPLY=true and provide GOOGLE_APPLICATION_CREDENTIALS for admin access.

 Usage:
   node scripts/merge_duplicate_users.js        # dry-run
   APPLY=true node scripts/merge_duplicate_users.js   # apply changes
*/

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const DB_URL = process.env.FIREBASE_DATABASE_URL || process.env.VITE_FIREBASE_DATABASE_URL;
if (!DB_URL) {
  console.error('Missing FIREBASE_DATABASE_URL or VITE_FIREBASE_DATABASE_URL env var.');
  process.exit(1);
}

const APPLY = String(process.env.APPLY || '').toLowerCase() === 'true' || process.env.APPLY === '1';

if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    databaseURL: DB_URL,
  });
} else {
  admin.initializeApp({ databaseURL: DB_URL });
}

(async () => {
  try {
    const db = admin.database();
    const usersSnap = await db.ref('users').once('value');
    if (!usersSnap.exists()) {
      console.log('No users found');
      return;
    }

    const users = usersSnap.val();
    const emailMap = new Map();

    for (const [key, u] of Object.entries(users)) {
      const e = (u && u.email) ? String(u.email).toLowerCase() : null;
      if (!e) continue;
      if (!emailMap.has(e)) emailMap.set(e, []);
      emailMap.get(e).push({ key, user: u });
    }

    const duplicates = [];
    for (const [email, list] of emailMap.entries()) {
      if (list.length > 1) duplicates.push({ email, list });
    }

    if (duplicates.length === 0) {
      console.log('No duplicate users found by email.');
      return;
    }

    console.log('\nFound duplicate user groups:');
    duplicates.forEach((d) => {
      console.log('\nEmail:', d.email);
      d.list.forEach(item => console.log('  -', item.key, JSON.stringify(item.user)));
    });

    if (!APPLY) {
      console.log('\nDry-run complete. To merge, re-run with APPLY=true and GOOGLE_APPLICATION_CREDENTIALS set.');
      return;
    }

    // APPLY: merge into the first key in each list
    const ops = [];
    for (const d of duplicates) {
      const master = d.list[0];
      const others = d.list.slice(1);
      const updates = {};
      for (const o of others) {
        // merge fields conservatively if missing in master
        const fields = Object.keys(o.user || {});
        for (const f of fields) {
          if (master.user[f] === undefined || master.user[f] === null) {
            updates[`users/${master.key}/${f}`] = o.user[f];
          }
        }
        // move notifications
        updates[`notifications/${master.key}`] = updates[`notifications/${master.key}`] || {};
        updates[`notifications/${master.key}/from_${o.key}`] = o.user.notifications || null;
        // mark other for deletion
        updates[`users/${o.key}`] = null;
        ops.push({ from: o.key, to: master.key });
      }
      await db.ref().update(updates);
    }

    console.log('\nMerge operations completed:', ops);
  } catch (err) {
    console.error('Failed:', err);
    process.exit(1);
  }
})();
