import { ref, get, set, update, query, orderByChild, equalTo, onValue } from 'firebase/database';
import { database, dbRef } from '../firebase';

/**
 * Get all users with pending role assignments
 */
export async function getPendingRoleUsers() {
  try {
    // Get all users and filter in memory until index is deployed
    const usersRef = ref(database, dbRef('users'));
    const snapshot = await get(usersRef);
    
    if (!snapshot.exists()) {
      return [];
    }
    
    // Filter users with roleStatus === 'pending' or no role assigned
    const users = Object.entries(snapshot.val())
      .map(([id, user]) => ({
        id,
        ...user
      }))
      .filter(user => 
        user.roleStatus === 'pending' || 
        (!user.roleId && !user.role && !user.roleName) // Also include users with no role info
      );
    
    console.log('[getPendingRoleUsers] Found users:', users.length);
    return users;
  } catch (error) {
    console.error('Failed to get pending role users:', error);
    throw error;
  }
}

/**
 * Assign a role to a user
 */
export async function assignUserRole(userId, roleData) {
  if (!userId || !roleData) throw new Error('Missing userId or role data');
  
  try {
    // Fetch the complete role object from the roles collection
    let completeRoleData = null;
    if (roleData.roleId) {
      try {
        const roleRef = ref(database, dbRef(`roles/${roleData.roleId}`));
        const roleSnapshot = await get(roleRef);
        if (roleSnapshot.exists()) {
          completeRoleData = roleSnapshot.val();
        }
      } catch (err) {
        console.warn('Failed to fetch complete role data:', err);
      }
    }

    // If we couldn't fetch the complete role, construct it from provided data
    if (!completeRoleData) {
      completeRoleData = {
        id: roleData.roleId,
        name: roleData.roleName,
        schedule: roleData.schedule || roleData.roleSchedule
      };
    }

    const updates = {
      // Store ONLY the three main fields like user 11 has (no duplicates)
      role: roleData.roleName || completeRoleData.name,
      roleData: completeRoleData,
      roleId: roleData.roleId
    };

    // If the role's schedule defines an employee type, set it on the user node as well
    if (completeRoleData && completeRoleData.schedule && completeRoleData.schedule.type) {
      updates.employeeType = completeRoleData.schedule.type;
    }

    const userRef = ref(database, dbRef(`users/${userId}`));
    await update(userRef, updates);
    
    // Also update audit log
    const auditRef = ref(database, dbRef(`auditLogs/${Date.now()}`));
    await set(auditRef, {
      action: 'assign_role',
      userId,
      roleId: roleData.roleId,
      roleName: roleData.roleName,
      timestamp: Date.now()
    });

    return true;
  } catch (error) {
    console.error('Failed to assign role to user:', error);
    throw error;
  }
}

/**
 * Set up a realtime listener for pending role assignments
 */
export function onPendingRoleUsersChange(callback) {
  if (!callback) throw new Error('Callback is required');
  
  try {
    const usersRef = ref(database, dbRef('users'));
    
    // Set up realtime listener for all users and filter in memory
    const unsubscribe = onValue(usersRef, (snapshot) => {
      if (!snapshot.exists()) {
        callback([]);
        return;
      }
      
      const users = Object.entries(snapshot.val())
        .map(([id, user]) => ({
          id,
          ...user
        }))
        .filter(user => 
          user.roleStatus === 'pending' || 
          (!user.roleId && !user.role && !user.roleName)
        );
      
      callback(users);
    });
    
    return unsubscribe;
  } catch (error) {
    console.error('Failed to set up pending roles listener:', error);
    throw error;
  }
}