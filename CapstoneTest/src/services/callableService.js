// Replace callable functions with direct Firebase SDK operations.
import { auth, database, dbRef } from '../firebase';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { ref, update } from 'firebase/database';
import { approveEnrollment as approveEnrollmentDB } from './enrollmentService';

/**
 * Create a Firebase Auth user and write minimal user node to Realtime Database.
 * This mirrors the behavior expected by the original callable: return object with identifiers.
 */
export async function callCreateAuthUser(userData) {
  try {
    if (!userData || !userData.email || !userData.password) {
      throw new Error('Missing email or password for createAuthUser');
    }

    // Create Auth user
    const userCred = await createUserWithEmailAndPassword(auth, userData.email, userData.password);
    const u = userCred.user;

    // Optionally set displayName and photoURL
    try {
      await updateProfile(u, {
        displayName: userData.name || `${userData.firstName || ''} ${userData.lastName || ''}`.trim() || undefined,
        photoURL: userData.profilePicture || undefined
      });
    } catch (e) {
      // Non-fatal
      console.warn('Failed to update profile for new user', e);
    }

    // Write minimal user node into Realtime Database (caller may later update other fields)
    // We avoid generating full facultyId numbering here; callers that previously used approveEnrollment (DB-only)
    // will still write their own users node. For Auth-only creation we write a lightweight record under usersAuth/<uid>
    const updates = {};
    updates[`usersAuth/${u.uid}`] = {
      uid: u.uid,
      email: userData.email,
      name: u.displayName || userData.name || '',
      profilePicture: userData.profilePicture || ''
    };
    await update(ref(database), updates);

    return { uid: u.uid, email: userData.email };
  } catch (err) {
    console.error('[callCreateAuthUser] error:', err);
    const msg = err?.message || String(err);
    throw new Error(msg);
  }
}

/**
 * Approve enrollment using the existing DB flow. If userData contains password/email we will attempt
 * to also create a Firebase Auth account and attach the uid to the user node when possible.
 */
export async function callApproveEnrollment(enrollmentIds, userData) {
  try {
    // First, run the DB-only approveEnrollment which returns userId/authUserId etc.
    const result = await approveEnrollmentDB(enrollmentIds, userData);

    // If caller requested creating an Auth user (password provided) and we don't already have an authUserId
    if (userData && userData.email && userData.password && !result.authUserId && !result.uid) {
      try {
        const created = await callCreateAuthUser({ email: userData.email, password: userData.password, name: userData.name, profilePicture: userData.profilePicture });
        // Patch the created uid into the new user node in DB if result.userId exists
        if (result.userId) {
          const updates = {};
          updates[`users/${result.userId}/uid`] = created.uid;
          await update(ref(database), updates);
          result.authUserId = created.uid;
          result.uid = created.uid;
        }
      } catch (authErr) {
        // Non-fatal: return DB result but surface warning
        console.warn('Created DB user but failed to create Auth user:', authErr);
        // attach error info for caller to display if desired
        result.authCreationError = authErr?.message || String(authErr);
      }
    }

    return result;
  } catch (err) {
    console.error('[callApproveEnrollment] error:', err);
    const msg = err?.message || String(err);
    throw new Error(msg);
  }
}
