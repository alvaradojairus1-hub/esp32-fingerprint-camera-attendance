import { ref, get, set, remove, push } from 'firebase/database';
import { database, dbRef } from '../firebase';

// Role collection name in Firebase
const ROLES_COLLECTION = 'roles';

/**
 * Get all roles from the database
 */
export async function getRoles() {
  try {
    const snapshot = await get(ref(database, dbRef(ROLES_COLLECTION)));
    console.log('[getRoles] Fetching roles from Firebase:', ROLES_COLLECTION);
    
    if (!snapshot.exists()) {
      console.warn('[getRoles] No roles found in database');
      return [];
    }
    
    const val = snapshot.val();
    const roles = Object.entries(val).map(([id, role]) => ({ id, ...role }));
    console.log('[getRoles] Found roles:', roles.length, 'roles');
    console.log('[getRoles] Role data:', roles);
    
    return roles;
  } catch (error) {
    console.error('Failed to get roles:', error);
    throw error;
  }
}

/**
 * Save a role to the database
 * @param {Object} role - The role object to save
 */
export async function saveRole(role) {
  try {
    let id = role.id;
    if (!id) {
      // Create new role
      const newRef = push(ref(database, dbRef(ROLES_COLLECTION)));
      id = newRef.key;
      await set(newRef, { 
        ...role,
        id,
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
      return { ...role, id };
    } else {
      // Update existing role
      const nodeRef = ref(database, dbRef(`${ROLES_COLLECTION}/${id}`));
      await set(nodeRef, { 
        ...role,
        id,
        updatedAt: Date.now()
      });
      return { ...role, id };
    }
  } catch (error) {
    console.error('Failed to save role:', error);
    throw error;
  }
}

/**
 * Delete a role from the database
 * @param {string} id - The ID of the role to delete
 */
export async function deleteRole(id) {
  if (!id) throw new Error('Missing role id');
  try {
    // Check if role is in use
    const usersSnapshot = await get(ref(database, dbRef('users')));
    if (usersSnapshot.exists()) {
      const users = Object.values(usersSnapshot.val());
      const isInUse = users.some(user => user.roleId === id || user.departmentId === id);
      if (isInUse) {
        throw new Error('Cannot delete role as it is assigned to one or more users');
      }
    }

    const nodeRef = ref(database, dbRef(`${ROLES_COLLECTION}/${id}`));
    await remove(nodeRef);
    return true;
  } catch (error) {
    console.error('Failed to delete role:', error);
    throw error;
  }
}

/**
 * Migrate existing departments to roles
 */
export async function migrateDepartmentsToRoles() {
  try {
    const deptSnapshot = await get(ref(database, dbRef('departments')));
    if (!deptSnapshot.exists()) return [];

    const departments = Object.entries(deptSnapshot.val()).map(([id, dept]) => ({
      id,
      ...dept
    }));

    // Migrate each department to a role
    for (const dept of departments) {
      const roleData = {
        name: dept.name,
        schedule: dept.schedule || null,
        migratedFromDepartment: dept.id,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      await saveRole(roleData);
    }

    return true;
  } catch (error) {
    console.error('Failed to migrate departments to roles:', error);
    throw error;
  }
}

// Compatibility layer for transition period
export async function getDepartments() {
  console.warn('getDepartments is deprecated. Please use getRoles instead.');
  return getRoles();
}

export async function saveDepartment(department) {
  console.warn('saveDepartment is deprecated. Please use saveRole instead.');
  return saveRole(department);
}

export async function deleteDepartment(id) {
  console.warn('deleteDepartment is deprecated. Please use deleteRole instead.');
  return deleteRole(id);
}