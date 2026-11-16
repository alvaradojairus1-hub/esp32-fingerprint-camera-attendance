// Add these new methods to your existing firebaseService.js file

// Employee Types
export const getEmployeeTypes = async () => {
  try {
    const typesSnapshot = await get(ref(database, dbRef('employeeTypes')));
    if (!typesSnapshot.exists()) return [];
    
    const types = typesSnapshot.val();
    return Object.entries(types).map(([id, type]) => ({
      id,
      ...type
    }));
  } catch (error) {
    console.error('Failed to fetch employee types:', error);
    throw error;
  }
};

export const saveEmployeeType = async (type) => {
  try {
    const typeRef = type.id 
      ? ref(database, dbRef(`employeeTypes/${type.id}`))
      : push(ref(database, dbRef('employeeTypes')));
    
    const { id, ...typeData } = type;
    await set(typeRef, typeData);
    
    return {
      id: type.id || typeRef.key,
      ...typeData
    };
  } catch (error) {
    console.error('Failed to save employee type:', error);
    throw error;
  }
};

export const deleteEmployeeType = async (typeId) => {
  try {
    await remove(ref(database, dbRef(`employeeTypes/${typeId}`)));
  } catch (error) {
    console.error('Failed to delete employee type:', error);
    throw error;
  }
};

// Company Settings
export const getCompanySettings = async () => {
  try {
    const settingsSnapshot = await get(ref(database, dbRef('companySettings')));
    return settingsSnapshot.exists() ? settingsSnapshot.val() : null;
  } catch (error) {
    console.error('Failed to fetch company settings:', error);
    throw error;
  }
};

export const saveCompanySettings = async (settings) => {
  try {
    await set(ref(database, dbRef('companySettings')), settings);
  } catch (error) {
    console.error('Failed to save company settings:', error);
    throw error;
  }
};

// Update the existing user-related methods to handle employee types
export const createUser = async (userData) => {
  try {
    const { employeeType, ...user } = userData;
    const userRef = ref(database, dbRef(`users/${userData.uid}`));
    
    // If employee type is provided, validate it exists
    if (employeeType) {
      const typeSnapshot = await get(ref(database, dbRef(`employeeTypes/${employeeType}`)));
      if (!typeSnapshot.exists()) {
        throw new Error('Invalid employee type');
      }
    }
    
    await set(userRef, {
      ...user,
      employeeType: employeeType || null,
      createdAt: serverTimestamp()
    });
    
    return user;
  } catch (error) {
    console.error('Failed to create user:', error);
    throw error;
  }
};

export const updateUser = async (uid, updates) => {
  try {
    const { employeeType, ...userData } = updates;
    
    // If employee type is changing, validate it exists
    if (employeeType) {
      const typeSnapshot = await get(ref(database, dbRef(`employeeTypes/${employeeType}`)));
      if (!typeSnapshot.exists()) {
        throw new Error('Invalid employee type');
      }
    }
    
    const userRef = ref(database, dbRef(`users/${uid}`));
    await update(userRef, {
      ...userData,
      employeeType: employeeType || null,
      updatedAt: serverTimestamp()
    });
    
    return {
      uid,
      ...userData,
      employeeType
    };
  } catch (error) {
    console.error('Failed to update user:', error);
    throw error;
  }
};

// Update attendance records to include employee type info
export const processPendingAttendance = async () => {
  try {
    // ... existing code ...
    
    // Add employee type to attendance record
    const user = users.find(u => u.id === entry.userId || u.employeeId === entry.employeeId);
    if (user?.employeeType) {
      attendancePayload.employeeType = user.employeeType;
    }
    
    // ... rest of the existing code ...
  } catch (error) {
    console.error('Failed to process pending attendance:', error);
    throw error;
  }
};