# Manual Edit Fix - Schedule Tracking Real-Time Updates

## Problem
When manually editing the `late` count (or other status values) in Firebase's `scheduleTracking` database, the change would show briefly and then revert back to 0.

### Root Cause
1. The `MyAttendance` component was trying to subscribe to `firebaseService.onScheduleTrackingUpdate()` - a method that **didn't exist**
2. Without a real-time listener on schedule tracking, manual edits in Firebase weren't triggering updates
3. Only `onAttendanceUpdate()` was subscribed, which doesn't fire when you edit schedule tracking data
4. Stats were being recalculated from OLD schedule tracking data, reverting the manual edit

## Solution Implemented

### 1. Added `onScheduleTrackingUpdate` listener to `firebaseService.js`

**File:** `src/services/firebaseService.js`

Added a new real-time listener function following the same pattern as `onAttendanceUpdate` and `onLeaveRequestsUpdate`:

```javascript
function onScheduleTrackingUpdate(cb) {
  const node = ref(database, dbRef('scheduleTracking'));
  const unsub = onValue(node, (snap) => {
    if (!snap.exists()) return cb(null);
    const val = snap.val();
    cb(val);
  });
  return unsub;
}
```

Exported in the module exports:
```javascript
onScheduleTrackingUpdate,
```

### 2. Fixed `MyAttendance.jsx` subscription

**File:** `src/components/dashboard/MyAttendance.jsx`

- Removed optional chaining (`?.`) since the method now exists
- Added proper null checks when flattening schedule tracking data
- Added `user` to the dependency array of stats effect for proper recalculation

**Key improvements:**
- Real-time listener now properly fires when Firebase `scheduleTracking` data changes
- Stats are recalculated immediately when schedule tracking updates
- Manual edits in Firebase now persist without reverting

## How It Works Now

1. User manually edits a `late` count in Firebase console
2. Real-time listener `onScheduleTrackingUpdate` detects the change
3. Schedule tracking data is updated in component state
4. `useEffect` with `scheduleTracking` dependency triggers `calculateStatsFromScheduleTracking()`
5. New stats are set and displayed to the user
6. Changes persist because they're driven by the real database updates

## Testing

To verify the fix works:
1. Go to MyAttendance component
2. Open Firebase console and edit `scheduleTracking/{date}/{userId}/label` 
3. Change a value from `late` to `on time` or vice versa
4. The stats should update in real-time
5. Refresh the page - the change should persist
