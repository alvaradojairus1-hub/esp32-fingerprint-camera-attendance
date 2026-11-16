const functions = require('firebase-functions');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');

// Initialize admin if not already initialized
try {
  admin.app();
} catch (e) {
  admin.initializeApp();
}

// Create transporter using same functions config as email.js
function createTransporter() {
  try {
    const cfg = functions.config().email || {};
    const smtp = cfg.smtp || {};
    return nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port || 465,
      secure: true,
      auth: {
        user: smtp.user,
        pass: smtp.pass,
      },
    });
  } catch (e) {
    console.warn('No functions email config found, transporter will be unavailable');
    return null;
  }
}

const transporter = createTransporter();

/**
 * approveEnrollment callable function
 * Input: { enrollmentId }
 * Caller must be authenticated and have custom claim role === 'hr'
 */
exports.approveEnrollment = functions.region('asia-southeast1').https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }

  // Require HR role
  if (!context.auth.token || context.auth.token.role !== 'hr') {
    throw new functions.https.HttpsError('permission-denied', 'HR role required');
  }

  // Accept either a single enrollmentId or an array enrollmentIds
  const enrollmentIds = Array.isArray(data && data.enrollmentIds) ? data.enrollmentIds : (data && data.enrollmentId ? [data.enrollmentId] : null);
  if (!enrollmentIds || !enrollmentIds.length) {
    throw new functions.https.HttpsError('invalid-argument', 'enrollmentId or enrollmentIds is required');
  }

  const db = admin.database();
  // Load all pending entries referenced
  const pendingSnaps = await Promise.all(enrollmentIds.map(id => db.ref(`pendingEnrollments/${id}`).once('value')));
  if (pendingSnaps.some(s => !s.exists())) {
    throw new functions.https.HttpsError('not-found', 'One or more pending enrollments not found');
  }

  // Use the first pending entry as representative for email/name defaults
  const pending = pendingSnaps[0].val();
  const email = pending.email;
  const name = pending.name || `${pending.firstName || ''} ${pending.lastName || ''}`.trim();

  if (!email) {
    throw new functions.https.HttpsError('invalid-argument', 'Pending enrollment missing email');
  }

  // Load all users once and do case-insensitive email lookup to avoid duplicates
  const usersRef = db.ref('users');
  const usersSnap = await usersRef.once('value');
  const usersObj = usersSnap.exists() ? usersSnap.val() : {};

  // Find existing user by email (case-insensitive)
  let existingKey = null;
  for (const [k, v] of Object.entries(usersObj)) {
    if (v && v.email && String(v.email).toLowerCase() === String(email).toLowerCase()) {
      existingKey = k;
      break;
    }
  }

  // Minimal secure password generation (admin may rotate or force reset)
  const defaultPassword = Math.random().toString(36).slice(-12) + '#A1';
  // Accept password provided from HR (via client/userData) if present
  const providedPassword = data && data.userData && data.userData.password ? String(data.userData.password) : null;

  // First, try to find an existing Firebase Auth user by email. This makes the flow idempotent
  // and avoids createUser failing when an account already exists.
  let authUser = null;
  let createdNewAuthUser = false;
  try {
    authUser = await admin.auth().getUserByEmail(email);
  } catch (err) {
    // auth/user-not-found means we should create one; other errors should surface
    const code = err && (err.code || (err.errorInfo && err.errorInfo.code));
    if (code && code.indexOf && code.indexOf('auth/user-not-found') !== -1) {
      authUser = null;
    } else {
      // Unexpected error when looking up user
      console.error('Error looking up auth user by email', err);
      throw new functions.https.HttpsError('internal', 'Failed to lookup auth user');
    }
  }

  // If no auth user exists, create one. Otherwise reuse the existing uid.
  let createdUser = null;
  try {
    if (!authUser) {
      // Use HR-provided password when available; otherwise use generated default
      const passwordToUse = providedPassword || defaultPassword;
      createdUser = await admin.auth().createUser({
        email,
        emailVerified: false,
        password: passwordToUse,
        displayName: name || undefined,
      });
      createdNewAuthUser = true;
    } else {
      createdUser = authUser;
      // Optionally update displayName if missing
      if (!authUser.displayName && name) {
        try { await admin.auth().updateUser(createdUser.uid, { displayName: name }); } catch (e) { console.warn('Failed to update existing auth user displayName', e); }
      }
    }
  } catch (err) {
    console.error('Failed to create or reuse auth user', err);
    throw new functions.https.HttpsError('internal', 'Failed to create or reuse auth user');
  }

  // If there's an existing user node, attach uid instead of creating a new node
  if (existingKey) {
    const updates = {};
    const existingNode = usersObj[existingKey] || {};

    // Merge fingerprints: take existing fingerprints (normalize) and add new from pending
    let existingFingerprints = [];
    if (Array.isArray(existingNode.fingerprints)) {
      existingFingerprints = existingNode.fingerprints.slice();
    } else if (existingNode.fingerprintId) {
      existingFingerprints = [{ id: existingNode.fingerprintId, timestamp: existingNode.enrolledAt || new Date().toISOString() }];
    }

    const newFingerprints = pendingSnaps.map((s, idx) => {
      const val = s.val();
      return {
        id: val.fingerprintId || val.key || `fp_${idx}`,
        pendingKey: enrollmentIds[idx],
        notes: val.notes || '',
        timestamp: val.timestamp || new Date().toISOString()
      };
    });

    // Build map to dedupe by id (new entries override existing)
    const fpMap = {};
    existingFingerprints.forEach(fp => { if (fp && fp.id) fpMap[String(fp.id)] = fp; });
    newFingerprints.forEach(fp => { if (fp && fp.id) fpMap[String(fp.id)] = fp; });
    let mergedFingerprints = Object.values(fpMap);
    // Sort by timestamp ascending (oldest first) and trim to newest 4 if necessary
    mergedFingerprints.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    if (mergedFingerprints.length > 4) {
      mergedFingerprints = mergedFingerprints.slice(-4);
    }

    // fill in missing fields conservatively
    updates[`users/${existingKey}/uid`] = existingNode.uid || createdUser.uid;
    updates[`users/${existingKey}/role`] = existingNode.role || 'faculty';
    updates[`users/${existingKey}/status`] = existingNode.status || 'active';
    updates[`users/${existingKey}/name`] = existingNode.name || name || '';
    updates[`users/${existingKey}/email`] = existingNode.email || email;
    updates[`users/${existingKey}/fingerprints`] = mergedFingerprints;
    // If HR provided a profile picture in the approval form, prefer it over pending
    if (data && data.userData && data.userData.profilePicture) {
      updates[`users/${existingKey}/profilePicture`] = data.userData.profilePicture;
    }
    updates[`users/${existingKey}/enrolledAt`] = new Date().toISOString();
    // Also write individual fingerprintId1..fingerprintId4 fields for compatibility
    for (let i = 0; i < 4; i++) {
      const fp = mergedFingerprints[i] || null;
      updates[`users/${existingKey}/fingerprintId${i+1}`] = fp ? fp.id : null;
    }
    // Set deviceId from first pending entry notes if available
    const deviceIdFromFirst = pendingSnaps[0]?.val()?.notes?.split('_')[0] || '';
    if (deviceIdFromFirst) updates[`users/${existingKey}/deviceId`] = deviceIdFromFirst;
    // Record if HR provided password
    if (providedPassword) updates[`users/${existingKey}/passwordSetByHR`] = true;

    // Remove all referenced pending enrollments (no archival)
    for (const id of enrollmentIds) {
      updates[`pendingEnrollments/${id}`] = null;
    }

    try {
      await db.ref().update(updates);
    } catch (err) {
      console.error('Failed to attach uid to existing user node', err);
      // Rollback created auth user only if we created it in this function
      if (createdNewAuthUser) {
        try { await admin.auth().deleteUser(createdUser.uid); } catch (e) { console.warn('Rollback failed', e); }
      }
      throw new functions.https.HttpsError('internal', 'Failed to finalize user creation');
    }

    // Send email: if we created the auth user here, send temporary password; otherwise send reset link
    let emailSentLocal = false;
    if (transporter) {
      try {
        if (createdNewAuthUser) {
          // If HR supplied a password, we should NOT write it anywhere; still send a notification
          const pwText = providedPassword ? '(set by HR)' : `Temporary password: ${defaultPassword}`;
          const mail = {
            from: `"HR System" <${functions.config().email.from}>`,
            to: email,
            subject: 'Your account has been created',
            text: `Hello ${name || ''},\n\nYour account has been created. ${pwText}\n\nRegards, HR`,
          };
          await transporter.sendMail(mail);
        } else {
          // existing auth user - send password reset link instead
          try {
            const link = await admin.auth().generatePasswordResetLink(email);
            const mail = {
              from: `"HR System" <${functions.config().email.from}>`,
              to: email,
              subject: 'Access to your account',
              text: `Hello ${name || ''},\n\nAn account already exists for ${email}. Use the link to set or reset your password:\n\n${link}\n\nRegards, HR`,
            };
            await transporter.sendMail(mail);
          } catch (err) {
            console.warn('Failed to generate/send password reset link', err);
            // fallback: do nothing, will record below
          }
        }
        emailSentLocal = true;
      } catch (err) {
        console.warn('Failed to send credentials email', err);
        await db.ref(`users/${existingKey}/emailStatus`).set({ sent: false, error: String(err) });
      }
    }

    try {
      const auditRef = db.ref('auditLogs').push();
      await auditRef.set({
        action: 'approveEnrollment',
        enrollmentIds,
        approvedBy: context.auth.uid,
        approvedAt: new Date().toISOString(),
        createdUserUid: createdUser.uid,
        facultyId: existingKey,
        emailSent: emailSentLocal,
        passwordSetByHR: !!providedPassword,
      });
    } catch (err) { console.warn('Failed to write audit log', err); }

    return { success: true, uid: createdUser.uid, facultyId: existingKey, emailSent: emailSentLocal };
  }

  // Optionally set custom claims (do it for both new and existing auth users)
  try {
    await admin.auth().setCustomUserClaims(createdUser.uid, { role: 'faculty' });
  } catch (err) {
    console.warn('Failed to set custom claims on user', err);
  }

  // Choose a facultyId/userId — try to use provided facultyId or fallback to timestamp
  const facultyId = (pending.facultyId && String(pending.facultyId)) || String(Date.now());
  // Build fingerprints array from all pending entries
  const fingerprints = pendingSnaps.map((s, idx) => {
    const val = s.val();
    return {
      id: val.fingerprintId || val.key || `fp_${idx}`,
      pendingKey: enrollmentIds[idx],
      notes: val.notes || '',
      timestamp: val.timestamp || new Date().toISOString()
    };
  });

  const userNode = {
    userId: pending.userId || facultyId,
    facultyId: facultyId,
    uid: createdUser.uid,
    email: email,
    name: name || '',
    // Prefer profilePicture provided by HR in userData (base64) when present, otherwise use pending enrollment value
    profilePicture: (data && data.userData && data.userData.profilePicture) || pending.profilePicture || pending.profile_picture || '',
    fingerprints,
    // Also set fingerprintId1..4 shortcut fields for legacy compatibility
    fingerprintId1: fingerprints[0] ? fingerprints[0].id : null,
    fingerprintId2: fingerprints[1] ? fingerprints[1].id : null,
    fingerprintId3: fingerprints[2] ? fingerprints[2].id : null,
    fingerprintId4: fingerprints[3] ? fingerprints[3].id : null,
    role: 'faculty',
    status: 'active',
    createdAt: new Date().toISOString(),
    enrolledAt: new Date().toISOString(),
    passwordSetByHR: !!providedPassword,
  };

  // Write user node and archive pending enrollment atomically using multi-path update
  const updates = {};
  updates[`users/${facultyId}`] = userNode;
  // ensure the archived / removal updates already added earlier for enrollmentIds

  try {
    await db.ref().update(updates);
  } catch (err) {
    console.error('Failed to write user node or archive pending enrollment', err);
    // Rollback created auth user only if we created it here
    if (createdNewAuthUser) {
      try { await admin.auth().deleteUser(createdUser.uid); } catch (e) { console.warn('Failed to rollback auth user', e); }
    }
    throw new functions.https.HttpsError('internal', 'Failed to finalize user creation');
  }

  // Send credentials email if transporter available
  let emailSent = false;
  if (transporter) {
    try {
      if (createdNewAuthUser) {
        // If HR provided a password, avoid including the generated temporary password in email
        const pwText = providedPassword ? '(set by HR)' : `Temporary password: ${defaultPassword}`;
        const mail = {
          from: `"HR System" <${functions.config().email.from}>`,
          to: email,
          subject: 'Your account has been created',
          text: providedPassword
            ? `Hello ${name || ''},\n\nAn account has been created for you by HR. HR has set your initial password. Please use the password provided by HR to sign in and change it on first login.\n\nRegards, HR`
            : `Hello ${name || ''},\n\nYour account has been created. You can sign in using ${email}. Please change your password on first login. Temporary password: ${defaultPassword}\n\nRegards, HR`,
        };
        await transporter.sendMail(mail);
        emailSent = true;
      } else {
        // existing auth user without a users node - send password reset link
        try {
          const link = await admin.auth().generatePasswordResetLink(email);
          const mail = {
            from: `"HR System" <${functions.config().email.from}>`,
            to: email,
            subject: 'Access to your account',
            text: `Hello ${name || ''},\n\nAn account already exists for ${email}. Use the link to set or reset your password:\n\n${link}\n\nRegards, HR`,
          };
          await transporter.sendMail(mail);
          emailSent = true;
        } catch (err) {
          console.warn('Failed to generate/send password reset link', err);
          await db.ref(`users/${facultyId}/emailStatus`).set({ sent: false, error: String(err) });
        }
      }
    } catch (err) {
      console.warn('Failed to send credentials email', err);
      await db.ref(`users/${facultyId}/emailStatus`).set({ sent: false, error: String(err) });
    }
  }

  // Write audit log
  try {
    const auditRef = db.ref('auditLogs').push();
    await auditRef.set({
      action: 'approveEnrollment',
      enrollmentIds,
      approvedBy: context.auth.uid,
      approvedAt: new Date().toISOString(),
      createdUserUid: createdUser.uid,
      facultyId,
      emailSent,
      passwordSetByHR: !!providedPassword,
    });
  } catch (err) {
    console.warn('Failed to write audit log', err);
  }

  return { success: true, uid: createdUser.uid, facultyId, emailSent };
});
