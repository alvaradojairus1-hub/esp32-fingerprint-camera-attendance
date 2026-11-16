/*
  scripts/migrate-profile-picture.js

  Usage (local):
    node scripts/migrate-profile-picture.js --dry-run
    node scripts/migrate-profile-picture.js --apply

  Requires a Firebase Admin service account JSON set via GOOGLE_APPLICATION_CREDENTIALS
  and the DATABASE_URL environment variable pointing to the RTDB URL.

  The script will scan /users and, for each user record that has `profile_picture` but not
  `profilePicture`, it will copy the value to `profilePicture`. When run with --apply it
  will write back to the database; with --dry-run it will only print the planned changes.
*/

const { initializeApp, applicationDefault, cert } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');
const fs = require('fs');
const path = require('path');

const argv = require('minimist')(process.argv.slice(2));
const dryRun = !!argv['dry-run'] || !argv['apply'];

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('DATABASE_URL environment variable is required and should point to your RTDB URL.');
    process.exit(1);
  }

  // Initialize Admin SDK (will use GOOGLE_APPLICATION_CREDENTIALS if set)
  try {
    initializeApp({
      databaseURL: dbUrl,
      credential: applicationDefault()
    });
  } catch (e) {
    // already initialized? ignore
  }

  const db = getDatabase();
  const usersRef = db.ref('users');
  const snapshot = await usersRef.get();
  if (!snapshot.exists()) {
    console.log('No users found. Exiting.');
    return;
  }

  const users = snapshot.val();
  const ops = [];

  if (Array.isArray(users)) {
    for (let i = 0; i < users.length; i++) {
      const u = users[i] || {};
      if (u.profile_picture && !u.profilePicture) {
        ops.push({ key: String(i), from: u.profile_picture, to: u.profile_picture });
      }
    }
  } else {
    for (const [key, u] of Object.entries(users || {})) {
      const user = u || {};
      if (user.profile_picture && !user.profilePicture) {
        ops.push({ key, from: user.profile_picture, to: user.profile_picture });
      }
    }
  }

  if (ops.length === 0) {
    console.log('No profile_picture entries found that need migrating.');
    return;
  }

  console.log(`Found ${ops.length} users to migrate.`);
  if (dryRun) {
    console.log('Dry run mode. The following changes would be applied:');
    for (const o of ops) console.log(` users/${o.key} -> set profilePicture (src: profile_picture) (${o.from ? 'has value' : 'empty'})`);
    console.log('\nRun with --apply to perform the updates.');
    return;
  }

  console.log('Applying changes...');
  const updates = {};
  for (const o of ops) {
    updates[`users/${o.key}/profilePicture`] = o.to;
  }

  await db.ref().update(updates);
  console.log('Migration applied. Updated', Object.keys(updates).length, 'entries.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
