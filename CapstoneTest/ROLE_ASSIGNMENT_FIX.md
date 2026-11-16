# Role Assignment Structure Fix

## Problem Analysis

When assigning a role to a new employee (User 12), the data structure was **incomplete** compared to User 11 who had the role properly assigned during initial enrollment.

### User 11 (Correct Structure) ✅
```json
{
  "role": "Cashier",
  "roleData": {
    "createdAt": 1761831303460,
    "id": "-OcpK3r-wCv7Hv_qEBOl",
    "name": "Cashier",
    "schedule": {
      "timezone": "Asia/Singapore",
      "type": "-OcpJkoyqJ78MSsYt0eG",
      "weekly": [...]
    },
    "updatedAt": 1761831303460
  },
  "roleId": "-OcpK3r-wCv7Hv_qEBOl"
}
```

### User 12 (Incorrect Structure) ❌
```json
{
  "role": "",                      // EMPTY - should be "Manager"
  "roleId": "-OcpFGQb74aLHWUON098",
  "roleName": "Manager",           // Loose field
  "roleSchedule": {...},           // WRONG - should be inside roleData.schedule
  "roleStatus": "assigned"
}
```

## Root Cause

The `assignUserRole()` function in `userRoleService.js` was only saving:
- `roleId`
- `roleName`
- `roleSchedule` (loose)

It was **NOT** saving:
- `roleData` (complete role object with all metadata)
- `role` (the role name as a simple string)

## Solution Implemented

Updated `assignUserRole()` to:

1. **Fetch the complete role object** from the `roles/{roleId}` collection
2. **Store the complete object** as `roleData` (same structure as User 11)
3. **Set the `role` field** to the role name (string)
4. **Keep backward-compatible fields** for any code that depends on individual fields

### Updated Function Flow

```javascript
export async function assignUserRole(userId, roleData) {
  // 1. Fetch complete role from roles collection
  const completeRoleData = await get(ref(database, `roles/${roleData.roleId}`));
  
  // 2. Prepare updates with proper structure
  const updates = {
    roleData: completeRoleData,    // Full role object (like User 11)
    role: roleData.roleName,       // Role name as string
    roleId: roleData.roleId,       // Backup field
    roleName: roleData.roleName,   // Backup field
    roleSchedule: ...,             // Backup field
    roleStatus: 'assigned',
    roleAssignedAt: Date.now()
  };
  
  // 3. Update user in Firebase
  await update(userRef, updates);
}
```

## What Changed

### File: `src/services/userRoleService.js`

**Before:**
- Only saved fragmented role data
- Missing `roleData` object
- Empty `role` field

**After:**
- Fetches complete role from `roles` collection
- Saves full role object as `roleData`
- Sets `role` to the role name
- Maintains backward compatibility with individual fields

## Result

After role assignment, **User 12 will now have:**
```json
{
  "role": "Manager",                    // ✅ Now populated
  "roleData": {
    "id": "-OcpFGQb74aLHWUON098",
    "name": "Manager",
    "schedule": {...},
    "createdAt": 1761831303460,
    "updatedAt": 1761831303460
  },                                    // ✅ Now complete
  "roleId": "-OcpFGQb74aLHWUON098",
  "roleStatus": "assigned"
}
```

## Impact

✅ **Attendance tracking** can now read `user.roleData.schedule` consistently  
✅ **Schedule validation** works the same for both initially-assigned and later-assigned roles  
✅ **Backward compatibility** maintained with individual role fields  
✅ **HR Dashboard** displays role information correctly  
✅ **Consistency** across all new employee workflows

## Testing

After this fix, when assigning a role to a new employee:

1. Create a new enrollment → User created with `role: undefined`
2. Assign a role via RoleManager → User updated with:
   - `role: "Role Name"`
   - `roleData: {complete role object}`
   - `roleId: "role-id"`

3. Verify in Firebase that the structure matches User 11 pattern

## Code Location

**Modified:** `src/services/userRoleService.js` → `assignUserRole()` function

**Related Components:**
- `src/components/settings/RoleManager.jsx` - Calls `assignUserRole()`
- `src/services/firebaseService.js` - Exposes `assignUserRole()`
- `src/components/attendance/ScheduleOverview.jsx` - Uses `roleData.schedule`
