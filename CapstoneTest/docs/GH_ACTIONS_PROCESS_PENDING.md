# FasTap Attendance Processor

## Overview
This documentation details the automated attendance processing system for FasTap, implemented using GitHub Actions. The system processes pending attendance records and integrates them into the main attendance database, ensuring reliable and timely attendance tracking.

### System Components
- GitHub Actions workflow
- Firebase Realtime Database integration
- Automated scheduling system
- Secure credential management

## Process Description
The system automatically executes `scripts/process_pending_attendance_admin.js` to:
1. Retrieve pending attendance records
2. Validate data integrity
3. Transfer validated records to the main attendance database
4. Generate processing reports

## Configuration Guide

### Required Secrets
Configure these in Repository -> Settings -> Secrets:

```yaml
FIREBASE_SA_KEY:
  description: Firebase service account key JSON
  required: true
  format: JSON string
  access: Write

FIREBASE_PROJECT_ID:
  description: Firebase project identifier
  required: true
  format: string
  example: "fastap-production"

PROCESS_PENDING_DRY_RUN:
  description: Enable test mode without database writes
  required: false
  format: boolean string
  default: "false"
```

### Security Configuration

#### Service Account Setup
1. Create dedicated service account
   ```
   Role: Firebase Realtime Database Admin
   ```

2. Custom Role Permissions
   - realtimeDatabase.data.get
   - realtimeDatabase.data.create
   - realtimeDatabase.data.update
   - realtimeDatabase.data.delete

#### Best Practices
- Follow principle of least privilege
- Avoid project Owner credentials
- Regularly rotate service account keys
- Implement audit logging

## Development & Testing

### Local Testing

#### Dry Run Mode
Test without database modifications:
```powershell
$env:PROCESS_PENDING_DRY_RUN = 'true'
node .\scripts\process_pending_attendance_admin.js
```

#### Production Testing
Test with actual database (use with caution):
```powershell
# Set credentials
$env:FIREBASE_SA_KEY = Get-Content 'C:\path\to\serviceAccount.json' -Raw
$env:FIREBASE_PROJECT_ID = 'your-project-id'

# Run processor
node .\scripts\process_pending_attendance_admin.js
```

### Workflow Management

#### Disable Automation
1. Temporary Pause
   - Access GitHub Actions UI
   - Locate FasTap workflow
   - Click "Disable workflow"

2. Permanent Removal
   - Remove workflow YAML from `.github/workflows`
   - Commit changes

### Security Guidelines

1. Credential Management
   - Secure storage of `FIREBASE_SA_KEY`
   - No credentials in source control
   - Regular key rotation schedule

2. Access Control
   - Implement role-based access
   - Monitor service account usage
   - Regular security audits

### Future Enhancements

Planned features:
1. Processing Reports
   - JSON summary storage
   - Workflow artifacts
   - Audit trail maintenance

2. Monitoring
   - Performance metrics
   - Error tracking
   - Usage statistics
