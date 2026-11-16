import { ref, set, get, update, remove, push, onValue } from "firebase/database";
import { database, dbRef } from "../firebase";
import { firebaseService } from './firebaseService';

/**
 * Recursively removes properties with undefined values from an object.
 * This prevents Firebase from rejecting updates that contain undefined values.
 * @param {object} obj - The object to sanitize
 */
const removeUndefinedRecursive = (obj) => {
    if (!obj || typeof obj !== 'object') return;
    for (const k of Object.keys(obj)) {
        const v = obj[k];
        if (v === undefined) {
            delete obj[k];
        } else if (v && typeof v === 'object' && !Array.isArray(v)) {
            removeUndefinedRecursive(v);
        }
    }
};

/**
 * Normalizes a pending enrollment record to a consistent format
 * @param {object} record - The raw enrollment record
 * @param {string} key - The record's key in the database
 * @returns {object} - Normalized enrollment record
 */
const normalizePendingEnrollment = (record, key) => {
    return {
        key,
        fingerprintId: record.fingerprintId || '',
        name: record.name || '',
        email: record.email || '',
        department: record.department || '',
        notes: record.notes || '',
        timestamp: record.timestamp || new Date().toISOString(),
        deviceId: record.notes?.split('_')[0] || '',  // Extract device ID from notes if available
        // Add any other fields that might be present
        ...record
    };
};

/**
 * Fetches all pending enrollments from Firebase
 * @returns {Promise<Array>} Array of pending enrollment records
 */
export const getPendingEnrollments = async () => {
    try {
        const snapshot = await get(ref(database, dbRef('pendingEnrollments')));
        if (snapshot.exists()) {
            const data = snapshot.val();
            return Object.entries(data)
                .filter(([_, value]) => value && typeof value === 'object')
                .map(([key, record]) => normalizePendingEnrollment(record, key));
        }
        return [];
    } catch (error) {
        console.error('Error fetching pending enrollments:', error);
        throw error;
    }
};

/**
 * Updates a pending enrollment with additional data
 * @param {string} enrollmentId - The enrollment ID (node key)
 * @param {object} updates - Data to update
 * @returns {Promise<boolean>} - True if update was successful
 */
export const updatePendingEnrollment = async (enrollmentId, updates) => {
    try {
        await update(ref(database, dbRef(`pendingEnrollments/${enrollmentId}`)), updates);
        return true;
    } catch (error) {
        console.error('Error updating pending enrollment:', error);
        throw error;
    }
};

/**
 * Approves a pending enrollment by creating a new user record
 * @param {string} enrollmentId - The enrollment ID from the pendingEnrollments node
 * @param {object} userData - Complete user data from HR form
 * @returns {Promise<string>} The new userId
 */
export const approveEnrollment = async (enrollmentId, userData) => {
    try {
        // Support single enrollmentId (string) or array of enrollment keys
        const enrollmentKeys = Array.isArray(enrollmentId) ? enrollmentId : [enrollmentId];
        

        // DB-only flow: write everything directly to the Realtime Database.
        // NOTE: This does not create Firebase Auth users. That must be done separately
        // if you need actual Auth accounts. This function writes the user node, fingerprints,
        // fingerprintId1..4, archives the pendingEnrollments, and writes a schedule if present.

        // Load all pending entries referenced
        const pendingSnapshots = await Promise.all(enrollmentKeys.map(k => get(ref(database, dbRef(`pendingEnrollments/${k}`)))));
        if (pendingSnapshots.some(s => !s.exists())) {
            throw new Error('One or more pending enrollments not found');
        }

        const pendingVals = pendingSnapshots.map(s => s.val());
        const primaryPending = pendingVals[0] || {};

        // Check if a user with the same email already exists in DB (case-insensitive)
        const usersSnapshot = await get(ref(database, dbRef('users')));
        const usersObj = usersSnapshot.exists() ? usersSnapshot.val() : {};
        const emailToFind = (userData.email || '').toLowerCase();
        if (emailToFind) {
            const found = Object.entries(usersObj).find(([id, u]) => u && u.email && String(u.email).toLowerCase() === emailToFind);
            if (found) {
                // Reuse existing user node: merge fingerprints and update fields
                const [existingId, existingUser] = found;

                // Build new fingerprints from pending
                const newFingerprints = pendingVals.map((val, idx) => ({
                    id: val.fingerprintId || val.key || `fp_${Date.now()}_${idx}`,
                    pendingKey: enrollmentKeys[idx],
                    notes: val.notes || '',
                    timestamp: val.timestamp || new Date().toISOString()
                }));

                // Normalize existing fingerprints
                let existingFingerprints = [];
                if (Array.isArray(existingUser.fingerprints)) existingFingerprints = existingUser.fingerprints.slice();
                else if (existingUser.fingerprintId) existingFingerprints = [{ id: existingUser.fingerprintId, timestamp: existingUser.enrolledAt || new Date().toISOString() }];

                const map = {};
                existingFingerprints.forEach(fp => { if (fp && fp.id) map[String(fp.id)] = fp; });
                newFingerprints.forEach(fp => { if (fp && fp.id) map[String(fp.id)] = fp; });
                let merged = Object.values(map);
                // Sort by timestamp ascending (oldest first) then keep only the most recent 4
                merged.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
                if (merged.length > 4) {
                    // Keep the newest 4 fingerprints (drop oldest)
                    merged = merged.slice(-4);
                }

                const updates = {};
                updates[`users/${existingId}/enrolledAt`] = new Date().toISOString();
                // persist department from HR form or pending entry if provided
                if (userData && (userData.department || userData.department === '')) updates[`users/${existingId}/department`] = userData.department || primaryPending.department || '';
                // persist employeeType if provided (from HR form), otherwise keep existing
                if (userData && userData.employeeType) {
                    updates[`users/${existingId}/employeeType`] = userData.employeeType;
                } else if (!existingUser.employeeType) {
                    // If no employee type exists, set default regular type
                    const types = await firebaseService.getEmployeeTypes();
                    const regularType = types.find(t => t.salaryType === 'monthly');
                    if (regularType) {
                        updates[`users/${existingId}/employeeType`] = regularType.id;
                    }
                }
                // write fingerprintId1..4 only (avoid duplicate `fingerprints` array)
                for (let i = 0; i < 4; i++) {
                    const fp = merged[i] || null;
                    updates[`users/${existingId}/fingerprintId${i+1}`] = fp ? fp.id : null;
                }
                // prefer HR-supplied profile picture
                if (userData && userData.profilePicture) updates[`users/${existingId}/profilePicture`] = userData.profilePicture;
                // remove pending enrollments (do not archive)
                enrollmentKeys.forEach((k, idx) => {
                    updates[`pendingEnrollments/${k}`] = null;
                });

                // Sanitize updates to remove undefined values before calling Firebase
                removeUndefinedRecursive(updates);

                await update(ref(database), updates);

                return { userId: existingId, authUserId: existingUser.uid || null, message: 'Updated existing user node and archived pending enrollments' };
            }
        }

        // No existing user found: create a new numeric userId (sequential) if possible
        const highestId = Object.values(usersObj).reduce((max, user) => {
            const userId = parseInt(user.userId || 0);
            return userId > max ? userId : max;
        }, 0);
        const nextId = highestId + 1;

        // Build fingerprints array from pending entries
        const fingerprints = pendingVals.map((val, idx) => ({
            id: val.fingerprintId || val.key || `fp_${Date.now()}_${idx}`,
            pendingKey: enrollmentKeys[idx],
            notes: val.notes || '',
            timestamp: val.timestamp || new Date().toISOString()
        }));

        // Build user record
        const facultyId = nextId;
        const createdAt = new Date().toISOString();
        const userRecord = {
            userId: nextId,
            facultyId: String(facultyId),
            uid: null,
            email: userData.email || primaryPending.email || '',
            name: userData.name || `${userData.firstName || ''} ${userData.lastName || ''}`.trim() || primaryPending.name || '',
            profilePicture: (userData && userData.profilePicture) || primaryPending.profilePicture || primaryPending.profile_picture || '',
            // department may come from HR form or the pending enrollment
            department: (userData && (userData.department || userData.department === '')) ? userData.department : (primaryPending.department || ''),
            // employeeType should use the Firebase employee type ID
            employeeType: userData?.employeeType || userData?.role?.schedule?.type || primaryPending?.employeeType,
            // write only fingerprintId1..4 to avoid duplicating the node
            fingerprintId1: fingerprints[0] ? fingerprints[0].id : null,
            fingerprintId2: fingerprints[1] ? fingerprints[1].id : null,
            fingerprintId3: fingerprints[2] ? fingerprints[2].id : null,
            fingerprintId4: fingerprints[3] ? fingerprints[3].id : null,
            role: userData.roleName || undefined,
            roleId: userData.roleId,
            roleData: userData.role || null,
            status: 'active',
            createdAt,
            enrolledAt: createdAt,
            passwordSetByHR: !!(userData && userData.password)
        };

        // Multi-path update: write user node, schedule (if provided), archive pending enrollments
        const updates = {};
        updates[`users/${nextId}`] = userRecord;
        if (userData && userData.schedule) {
            const scheduleToWrite = {
                userId: nextId,
                timezone: userData.schedule.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
                weekly: userData.schedule.weekly || {},
                type: userData.schedule.type || 'permanent',
                createdAt
            };
            updates[`schedules/${nextId}`] = scheduleToWrite;
        }

        enrollmentKeys.forEach((k, idx) => {
            // remove pending entries after creating the user (no archive)
            updates[`pendingEnrollments/${k}`] = null;
        });

        // Sanitize updates to remove undefined values before calling Firebase
        // This prevents "values argument contains undefined" errors when fields like
        // employeeType, roleId are not provided (they will be assigned later via Employee Type Management)
        removeUndefinedRecursive(updates);

        await update(ref(database), updates);

        return { userId: nextId, authUserId: null, message: 'Created user node and archived pending enrollments' };
    } catch (error) {
        console.error('Error approving enrollment:', error);
        throw error;
    }
};

/**
 * Assigns one or more pending fingerprints to an existing user
 * @param {string|Array<string>} enrollmentIds - Single enrollment ID or array of enrollment IDs from pendingEnrollments
 * @param {string} existingUserId - The existing user ID to assign to
 * @returns {Promise<object>} Returns merged fingerprints and userId
 */
export const assignFingerprintToExistingUser = async (enrollmentIds, existingUserId) => {
    try {
        const keys = Array.isArray(enrollmentIds) ? enrollmentIds : [enrollmentIds];

        // Load all pending enrollment snapshots
        const pendingSnapshots = await Promise.all(keys.map(k => get(ref(database, dbRef(`pendingEnrollments/${k}`)))));
        if (pendingSnapshots.some(s => !s.exists())) {
            throw new Error('One or more pending enrollments not found');
        }

        const pendingDatas = pendingSnapshots.map(s => s.val());

        // Build new fingerprint objects from pending entries
        const newFingerprints = pendingDatas.map((val, idx) => ({
            id: val.fingerprintId || `fp_${Date.now()}_${idx}`,
            pendingKey: keys[idx],
            notes: val.notes || '',
            timestamp: val.timestamp || new Date().toISOString()
        }));

        // Get existing user data
        const userSnapshot = await get(ref(database, dbRef(`users/${existingUserId}`)));
        if (!userSnapshot.exists()) {
            throw new Error('User not found');
        }
        const user = userSnapshot.val() || {};

        // Normalize existing fingerprints into array
        let existingFingerprints = [];
        if (Array.isArray(user.fingerprints)) {
            existingFingerprints = user.fingerprints.slice();
        } else if (user.fingerprintId) {
            existingFingerprints = [{ id: user.fingerprintId, timestamp: new Date().toISOString() }];
        }

        // Merge by fingerprint id (new entries override existing with same id)
        const map = {};
        existingFingerprints.forEach(fp => { if (fp && fp.id) map[String(fp.id)] = fp; });
        newFingerprints.forEach(fp => { if (fp && fp.id) map[String(fp.id)] = fp; });

        let merged = Object.values(map);
        // Sort by timestamp ascending so older remain first (useful if trimming)
        merged.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

        // If merged exceeds 4, trim to most recent 4 (drop oldest). UI should prevent this but be defensive here.
        if (merged.length > 4) {
            merged = merged.slice(-4);
        }

        // Prepare multi-path updates: set fingerprintId1..4 and archive/remove pending entries
        const updates = {};
        updates[`users/${existingUserId}/enrolledAt`] = new Date().toISOString();
        // Write only fingerprintId1..4 from merged list
        for (let i = 0; i < 4; i++) {
            const fp = merged[i] || null;
            updates[`users/${existingUserId}/fingerprintId${i+1}`] = fp ? fp.id : null;
        }

        // Optionally set deviceId from first pending entry notes
        const deviceId = pendingDatas[0]?.notes?.split('_')[0] || '';
        if (deviceId) updates[`users/${existingUserId}/deviceId`] = deviceId;

        // Remove each pending enrollment referenced (do not archive)
        keys.forEach((k, idx) => {
            updates[`pendingEnrollments/${k}`] = null;
        });

        // Apply multi-path update at root
        await update(ref(database), updates);

        return { userId: existingUserId, fingerprints: merged };
    } catch (error) {
        console.error('Error assigning fingerprint(s):', error);
        throw error;
    }
};

/**
 * Rejects a pending enrollment
 * @param {string} enrollmentId - The enrollment ID to reject
 * @returns {Promise<void>}
 */
export const rejectEnrollment = async (enrollmentId) => {
    try {
        await remove(ref(database, dbRef(`pendingEnrollments/${enrollmentId}`)));
    } catch (error) {
        console.error('Error rejecting enrollment:', error);
        throw error;
    }
};

/**
 * Gets all active users for assignment dropdown
 * @returns {Promise<Array>} Array of active users
 */
export const getActiveUsers = async () => {
    try {
        const snapshot = await get(ref(database, dbRef('users')));
        if (snapshot.exists()) {
            const data = snapshot.val();
            return Object.entries(data)
                .filter(([_, user]) => user && (user.status === 'active' || typeof user.status === 'undefined'))
                .map(([userId, user]) => ({
                    userId,
                    name: user.name || '',
                    email: user.email || '',
                    department: user.department || '',
                    position: user.position || '',
                    fingerprintId: user.fingerprintId || ''
                }));
        }
        return [];
    } catch (error) {
        console.error('Error fetching active users:', error);
        throw error;
    }
};

/**
 * Fetch only fingerprint ids from pendingEnrollments (minimal payload)
 * Returns array of { key, fingerprintId }
 */
export const getPendingFingerprintIds = async () => {
    try {
        const snapshot = await get(ref(database, dbRef('pendingEnrollments')));
        if (snapshot.exists()) {
            const data = snapshot.val();
            return Object.entries(data)
                .filter(([_, value]) => value && typeof value === 'object')
                .map(([key, record]) => ({
                    key,
                    fingerprintId: record.fingerprintId || ''
                }));
        }
        return [];
    } catch (error) {
        console.error('Error fetching pending fingerprint IDs:', error);
        throw error;
    }
};

/**
 * Subscribe to pendingEnrollments node and invoke cb(entries) on changes.
 * Returns the unsubscribe function.
 */
export function onPendingEnrollments(cb) {
    const unsub = onValue(ref(database, dbRef('pendingEnrollments')), (snapshot) => {
        if (!snapshot.exists()) {
            cb([]);
            return;
        }

        const data = snapshot.val();
        const entries = Object.entries(data)
            .filter(([_, value]) => value && typeof value === 'object')
            .map(([key, record]) => normalizePendingEnrollment(record, key));

        cb(entries);
    });
    
    return unsub;
}