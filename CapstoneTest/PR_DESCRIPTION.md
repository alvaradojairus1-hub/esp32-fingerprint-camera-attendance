PR: Fix Firebase service and initialization issues

Summary
-------
This PR contains small, safe fixes to improve robustness and build compatibility:

1. src/firebase.js
   - Guard analytics initialization so it only runs in browser environments
     (avoids errors during SSR/tests).
   - Allow Firebase config values to be overridden using Vite env vars
     (VITE_FIREBASE_*). Defaults preserved.

2. src/services/firebaseService.js
   - Removed unsupported private field (#rateLimits) and private method
     (#checkRateLimit). Replaced with `rateLimits` and `checkRateLimit` as
     regular properties/methods on the exported object to ensure compatibility
     with common bundlers and targets.
   - Fixed a corrupted insertion inside `getAttendance` that caused build errors.

3. Dev tooling
   - Installed `terser` as a devDependency to satisfy Vite's minifier requirement
     and allow production builds to complete.

Why
---
- The codebase previously used modern private-field syntax inside an object
  which Rollup/Vite couldn't parse in this build setup, causing the build to
  fail.
- Analytics initialization could throw in non-browser contexts.
- The fixes are small and conservative to minimize behavioral changes.

How to test (quick smoke)
-------------------------
1. Install dependencies (if you haven't already):

   npm install

2. Run build to ensure production bundle succeeds:

   npm run build

3. Start dev server and open the app:

   npm run dev
   Open http://localhost:5173/

4. Verify pages that rely on Realtime DB listeners (Users/Attendance/Enrollments)
   load without console errors. Perform a couple of actions (profile update, view
   attendance) to ensure runtime behavior is unchanged.

Notes & follow-ups
------------------
- Consider adding a CI build that runs `npm run build` to catch regressions early.
- Audit dev dependencies and address `npm audit` vulnerabilities separately.
- If you rely on a staging DB prefix, set `VITE_DB_PREFIX=/staging` when running dev.

Files changed
-------------
- src/firebase.js (guard analytics, env overrides)
- src/services/firebaseService.js (fix rate limiting helpers + attendance parsing)
- package.json (dev dep: terser installed)

If you want, I can:
- Create a PR branch and prepare a commit message.
- Run the dev server and do a more thorough runtime smoke test.

### Suggested hardened Realtime Database rules

I added a suggested, non-destructive rules file: `database.rules.hardened.json`.
It contains scoped rules for `users`, `pendingEnrollments`, `attendance`, `leaveRequests`, `notifications`, `auditLogs`, `payroll`, and `devices`.

Why this is separate
- The current `database.rules.json` remains unchanged so your live deployment is unaffected.
- `database.rules.hardened.json` is a ready-to-review policy you can test locally or deploy when you're ready.

How to test the hardened rules (using Firebase Emulator):

1. Install firebase-tools (if not installed):

```powershell
npm install -g firebase-tools
```

2. Start the emulator from the project root:

```powershell
firebase emulators:start --only database
```

3. In another terminal, deploy the hardened rules to the emulator (no live effect):

```powershell
firebase deploy --only database --project=demo --config firebase.json --force --rules database.rules.hardened.json
```

Note: The `--project` value above can be any id when using emulator; production deploy requires correct project and proper review.

How to deploy to production (careful):

1. Review `database.rules.hardened.json` thoroughly.
2. Backup current rules and data.
3. Deploy with firebase-tools using a service account or your admin account:

```powershell
firebase deploy --only database --project your-project-id --rules database.rules.hardened.json
```

If you'd like, I can:
- Run a local emulator run and simulate common read/write scenarios to validate the hardened rules (requires firebase-tools and local environment).
- Provide a complementary test plan that lists expected behavior for HR, regular users, devices, and unauthenticated writers (for device enrollment writes).

