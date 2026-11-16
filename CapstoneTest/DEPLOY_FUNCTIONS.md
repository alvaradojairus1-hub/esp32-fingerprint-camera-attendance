# Deploying FasTap Cloud Functions

This document provides step-by-step instructions for deploying and testing the FasTap system's cloud functions, particularly the `approveEnrollment` function that handles employee enrollment. These instructions cover both local testing with Firebase Emulator Suite and production deployment.

## Prerequisites
- Node.js (18+ recommended) and npm
- firebase-tools installed globally (or use npx): `npm i -g firebase-tools`
- Make sure your Firebase project is selected (or pass `--project <id>` to firebase commands)

1) Install server dependencies
Open a PowerShell prompt at the project root and run:

```powershell
cd functions
npm install
```

2) Configure Email Settings
Set up your SMTP/email configuration for sending employee credentials and notifications. Replace the placeholders with your company's actual SMTP values.

```powershell
# Replace values before running
firebase functions:config:set \
  email.smtp.host="smtp.example.com" \
  email.smtp.port="465" \
  email.smtp.user="smtp-user" \
  email.smtp.pass="smtp-pass" \
  email.from="hr@yourcompany.com" \
  --project <YOUR_PROJECT_ID>
```

You can verify the config with:

```powershell
firebase functions:config:get --project <YOUR_PROJECT_ID>
```

3) Deploy to Firebase (production)

```powershell
# From project root
firebase deploy --only functions:approveEnrollment --project <YOUR_PROJECT_ID>
```

4) Quick local testing with Firebase Emulator Suite (recommended)

Steps below start the emulator and invoke the callable function locally without touching production.

a) Start the emulator (functions, database, auth are recommended)

```powershell
# From project root - must have firebase.json configured
firebase emulators:start --only functions,auth,database --project <YOUR_PROJECT_ID>
```

b) (Optional) Prepare environment variables for emulator shells

```powershell
$env:FIREBASE_AUTH_EMULATOR_HOST = "localhost:9099"
$env:FIREBASE_DATABASE_EMULATOR_HOST = "localhost:9000"
```

c) Create a test HR user in the auth emulator and give it the `hr` custom claim
You can do this using a tiny Node script that uses the Admin SDK while the emulator is running.
Save this as `functions/scripts/create_hr_user_emulator.js` (or run inline):

```powershell
node -e "const admin=require('firebase-admin'); admin.initializeApp({projectId:'<YOUR_PROJECT_ID>'}); (async()=>{ const u=await admin.auth().createUser({uid:'hr_test',email:'hr@example.com',password:'password'}); await admin.auth().setCustomUserClaims(u.uid,{role:'hr'}); console.log('created hr user',u.uid); })()"
```

Note: when running against the emulator, ensure the `FIREBASE_AUTH_EMULATOR_HOST` env var is set so the Admin SDK talks to the emulator.

d) Run the test invoker script (included in the repo) to call the local function

From the project root:

```powershell
# Optionally install axios if you want (test script works with builtin https), but we include a small node script already.
node .\scripts\test_call_approve_emulator.js --projectId=<YOUR_PROJECT_ID> --enrollmentId=<ENROLLMENT_ID> --authUid=hr_test
```

Replace `<ENROLLMENT_ID>` with a pending enrollment key that exists in your local emulator database under `pendingEnrollments/<ENROLLMENT_ID>`.

Troubleshooting and notes
- If the function fails with `unauthenticated` when calling locally, make sure you passed `--authUid` (or created a test user) and that the emulator's auth is running.
- The callable functions emulator expects a POST to `http://localhost:5001/<PROJECT>/us-central1/<FUNCTION>` with a JSON body `{ "data": { ... } }` and an Authorization header. The test script included does this.
- For production email sending, ensure your SMTP provider allows sending from the configured `email.from` address.
- The `approveEnrollment` function will attempt to reuse an existing Firebase Auth user by email if present, or create one and send a temporary password. It also writes audit logs and archives the pending enrollment.

Security reminder
- Do not expose production SMTP credentials in public repos or CI logs. Use Firebase Functions config and restrict access to the project.

## Sample Data for Testing

You can use the provided `functions/emulator_seed.json` file to create sample pending enrollments for testing. The file includes examples for different employee types and scenarios. Modify the sample data to match your company's specific needs.
