// src/services/authService.js
import { initializeApp, getApps } from "firebase/app";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signOut,
  updateProfile,
  sendEmailVerification,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  sendPasswordResetEmail,
} from "firebase/auth";
import { ref, get, set } from "firebase/database";
import { app, database, auth } from "../firebase";
import { firebaseService } from './firebaseService';

// ✅ Use getApps() to prevent reinitialization errors
let secondaryApp;
if (!getApps().some(a => a.name === "Secondary")) {
  secondaryApp = initializeApp(app.options, "Secondary");
} else {
  secondaryApp = getApps().find(a => a.name === "Secondary");
}

export const authService = {
  /**
   * Registers a new user.
   * - Saves email + password in Firebase Authentication
   * - Saves full user info in Realtime Database
   * - Keeps the HR/admin logged in
   */
  async registerUser(formData) {
  const { email, password, ...userInfo } = formData;
    const secondaryAuth = getAuth(secondaryApp); // isolated session (client fallback)

    try {
      console.log("📦 Registering new user:", email);

      // Client-side creation using isolated secondaryAuth (keeps HR logged in)
      const userCredential = await createUserWithEmailAndPassword(
        secondaryAuth,
        email,
        password
      );
      const newUser = userCredential.user;
      const newUserUid = newUser.uid;

      // ✅ Get the current user list to generate new incremental ID
      const snapshot = await get(ref(database, "users"));
      const users = snapshot.exists() ? Object.values(snapshot.val()) : [];
      const nextId =
        users.reduce((max, u) => Math.max(max, parseInt(u.userId || 0)), 0) + 1;

      // ✅ Save user info in Realtime Database
      const newUserData = {
        userId: nextId,
        uid: newUserUid,
        email,
        ...userInfo,
        createdAt: new Date().toISOString(),
        status: "active",
      };

      // Update Auth profile (display name / photo)
      try {
        await updateProfile(newUser, {
          displayName: `${userInfo.firstName || ''} ${userInfo.lastName || ''}`.trim(),
          photoURL: userInfo.profilePicture || ''
        });
      } catch (profErr) {
        console.warn('updateProfile failed (non-fatal):', profErr.message || profErr);
      }

      // Send email verification to the new user (best-effort)
      try {
        await sendEmailVerification(newUser);
      } catch (verErr) {
        console.warn('sendEmailVerification failed (non-fatal):', verErr.message || verErr);
      }

      await set(ref(database, `users/${nextId}`), newUserData);

      console.log("✅ User saved to Realtime Database:", newUserData);

      // Write audit log (best-effort)
      try {
        await firebaseService.writeAuditLog({
          action: 'user_registration',
          status: 'success',
          userId: newUserUid,
          facultyId: String(nextId),
          email
        });
      } catch (auditErr) {
        console.warn('writeAuditLog failed (non-fatal):', auditErr && auditErr.message ? auditErr.message : auditErr);
      }

      // ✅ Sign out the secondary auth (so HR stays logged in)
      await signOut(secondaryAuth);

      // Return useful identifiers so callers (like EnrollmentModule) can attach
      // fingerprints and further data to the newly created user node.
      return {
        success: true,
        message: "User successfully registered in Firebase Auth and Realtime Database",
        uid: newUserUid,
        userId: nextId,
        facultyId: nextId,
        email,
      };
    } catch (error) {
      console.error("❌ Registration failed:", error);
      throw new Error(error.message || "User registration failed");
    }
  },
  /**
   * Change password for the currently authenticated user.
   * This will reauthenticate the user with their current password first
   * because updatePassword is a security-sensitive operation.
   */
  async changePassword(currentPassword, newPassword) {
    if (!auth || !auth.currentUser) {
      throw new Error("No authenticated user. Please sign in again.");
    }
    // Basic validation
    if (!currentPassword || typeof currentPassword !== 'string' || !currentPassword.trim()) {
      throw new Error('Current password is required to change your password.');
    }
    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
      throw new Error('New password must be at least 6 characters long.');
    }

    const user = auth.currentUser;

    // Check that the user's provider includes email/password; if not, changing
    // password via email/password APIs will fail. Suggest password reset instead.
    const hasPasswordProvider = Array.isArray(user.providerData) &&
      user.providerData.some(p => p && p.providerId === 'password');

    if (!hasPasswordProvider) {
      throw new Error('Your account is not using email/password sign-in. Use the Forgot Password flow to set a password or contact your administrator.');
    }

    try {
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      // Try reauthentication using credential
      try {
        await reauthenticateWithCredential(user, credential);
      } catch (reauthErr) {
        // If reauth fails, log the code and attempt fallback sign-in only if
        // the currentPassword appears non-empty. Some environments may return
        // auth/invalid-credential which indicates the credential can't be used.
        console.warn('reauthenticateWithCredential failed:', reauthErr?.code || reauthErr);

        // As a secondary attempt, try signInWithEmailAndPassword which will
        // create a fresh credential and sign the user in. This may still fail
        // if the password is incorrect or account isn't password-based.
        try {
          const { signInWithEmailAndPassword } = await import('firebase/auth');
          await signInWithEmailAndPassword(auth, user.email, currentPassword);
        } catch (fallbackErr) {
          console.error('Fallback signInWithEmailAndPassword failed:', fallbackErr?.code || fallbackErr);
          // Provide a helpful error message to the caller
          if (fallbackErr?.code === 'auth/wrong-password' || fallbackErr?.code === 'auth/invalid-credential') {
            throw new Error('Current password is incorrect.');
          }
          throw new Error(fallbackErr?.message || 'Reauthentication failed. Please try the Forgot Password flow.');
        }
      }

      // If we got here, reauthentication succeeded — update the password
      await updatePassword(user, newPassword);
      return { success: true };
    } catch (err) {
      console.error('changePassword failed:', err?.code || err, err?.message || '');
      // Map common Firebase auth errors to friendlier messages
      if (err?.code === 'auth/wrong-password' || err?.code === 'auth/invalid-credential') {
        throw new Error('Current password is incorrect.');
      }
      if (err?.code === 'auth/weak-password') {
        throw new Error('The new password is too weak.');
      }
      // Default fallback
      throw new Error(err?.message || 'Failed to change password.');
    }
  },

  /**
   * Send a password reset email to the supplied address.
   */
  async resetPassword(email) {
    if (!email) throw new Error("Email is required for password reset.");
    try {
      await sendPasswordResetEmail(auth, email);
      return { success: true };
    } catch (err) {
      console.error('resetPassword failed:', err);
      throw new Error(err?.message || 'Failed to send password reset email.');
    }
  },
};
