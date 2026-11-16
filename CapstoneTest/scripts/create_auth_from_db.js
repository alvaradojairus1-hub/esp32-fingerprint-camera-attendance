/*
Script: scripts/create_auth_from_db.js
Purpose: Create Firebase Auth users from Realtime Database users nodes that do not have a uid yet.

Usage:
1. Install dependencies: npm install firebase-admin
2. Provide a service account JSON and set environment variable:
   $env:GOOGLE_APPLICATION_CREDENTIALS = 'C:\path\to\serviceAccount.json'
3. Run: node scripts/create_auth_from_db.js

Notes:
- This script will NOT write plaintext passwords to the DB. It will generate temporary passwords when no HR-provided password is present.
- It will print the created user's email, uid, and temporary password to the console so an admin can communicate it securely.
- Alternatively, it prints password reset links if you prefer that flow.
*/

const admin = require('firebase-admin');
const crypto = require('crypto');

function generateTempPassword(len = 12) {
  return crypto.randomBytes(Math.ceil(len * 0.75)).toString('base64').slice(0, len) + 'Aa1!';
}

async function main() {
  try {
    // Initialize admin from GOOGLE_APPLICATION_CREDENTIALS
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      databaseURL: process.env.FIREBASE_DATABASE_URL || 'https://capstone-d5b64-default-rtdb.asia-southeast1.firebasedatabase.app'
    });

    const db = admin.database();
    console.log('Reading users from Realtime Database...');
    const usersSnap = await db.ref('users').once('value');
    if (!usersSnap.exists()) {
      console.log('No users node found. Exiting.');
      return;
    }

    const users = usersSnap.val();
    const entries = Object.entries(users);
    console.log(`Found ${entries.length} user records in DB.`);

    for (const [key, user] of entries) {
      try {
        if (user && user.uid) {
          console.log(`Skipping users/${key} (already has uid: ${user.uid})`);
          continue;
        }
        if (!user || !user.email) {
          console.log(`Skipping users/${key} (no email)`);
          continue;
        }

        const email = String(user.email).trim().toLowerCase();

        // If the DB record already contains a stored password (not recommended), you may use it.
        // We will prefer an existing `password` field only if present; otherwise generate a temporary password.
        let passwordToUse = null;
        if (user.password && typeof user.password === 'string' && user.password.length >= 8) {
          console.log(`Note: users/${key} has a 'password' field - using it to create Auth user (consider removing this field after).`);
          passwordToUse = user.password;
        } else {
          passwordToUse = generateTempPassword(12);
        }

        // Create the auth user
        const created = await admin.auth().createUser({
          email,
          emailVerified: false,
          password: passwordToUse,
          displayName: user.name || undefined
        });

        console.log(`Created auth user for users/${key} -> uid=${created.uid} email=${email}`);

        // Update DB user node with uid and metadata
        const updates = {};
        updates[`users/${key}/uid`] = created.uid;
        updates[`users/${key}/authCreatedAt`] = new Date().toISOString();
        updates[`users/${key}/authCreatedByScript`] = true;
        // Do NOT write plaintext password back to DB. If you need to communicate it, use secure channel.

        await db.ref().update(updates);

        // Optionally generate a password reset link instead of communicating the temp password
        const resetLink = await admin.auth().generatePasswordResetLink(email).catch(() => null);

        console.log(`-> users/${key} updated. Temporary password (admin-only): ${passwordToUse}`);
        if (resetLink) console.log(`-> Password reset link (recommend sending to user): ${resetLink}`);
        console.log('---');
      } catch (errUser) {
        console.error(`Failed processing users/${key}:`, errUser.message || errUser);
      }
    }

    console.log('Script complete. Review console output for created accounts and reset links.');
    process.exit(0);
  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  }
}

main();
