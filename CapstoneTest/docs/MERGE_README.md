# FasTap Data Synchronization Integration

This document explains how to configure and use the data synchronization feature in FasTap, including the "Sync Now" button and Apps Script deployment setup.

## Configuration Options

### Apps Script URL Configuration

1. Firebase Realtime Database (Recommended)
   - Path: /appConfig/syncApiUrl
   - Store the full Apps Script deployment URL (for example: https://script.google.com/macros/s/AKfycb…/exec)
   - When present, the frontend will prefer this value. This lets you change the deployment without redeploying the site.

2. Environment Variables (Development)
   - Variable: VITE_APPS_SCRIPT_SYNC_URL
   - Add to your .env.local file:
     ```
     VITE_APPS_SCRIPT_SYNC_URL="https://script.google.com/macros/s/.../exec"
     ```

3. Fallback Configuration
   - Location: `src/config/appsScriptConfig.js`
   - Set `APPS_SCRIPT_SYNC_FALLBACK` for development fallback

## Security Considerations

1. API Security
   - The Apps Script endpoint is publicly accessible by default
   - Implement token-based authentication:
     ```
     https://script.google.com/macros/s/.../exec?_token=YOUR_SECRET_TOKEN
     ```
   - Validate tokens in Apps Script
   - Use environment-specific tokens

2. Access Control
   - Sync functionality is restricted to HR/Admin roles
   - Implement proper role-based access control
   - Log all synchronization attempts for audit

## Implementation

### Adding the Sync Button

```jsx
import SyncNowButton from '../components/shared/SyncNowButton';

// In your admin component:
<SyncNowButton />
```

### Button Features
- Visual feedback during sync
- Success/error notifications
- Audit logging of sync attempts
- Automatic retry on failure

## Troubleshooting Guide

### Common Issues

1. Timeout Errors
   - Verify Apps Script endpoint accessibility
   - Check deployment URL configuration
   - Review browser console for CORS errors
   - Ensure stable network connection

2. Authentication Errors (401/403)
   - Verify token configuration
   - Check Apps Script deployment permissions
   - Ensure user has proper role assignments
   - Review security rules in Firebase

3. Data Sync Issues
   - Check data format compatibility
   - Verify database access permissions
   - Review sync logs for specific errors
   - Ensure proper service account configuration

### Monitoring and Maintenance

1. Regular Tasks
   - Monitor sync success rates
   - Review error logs
   - Update security tokens
   - Check performance metrics

2. Best Practices
   - Schedule syncs during off-peak hours
   - Implement gradual sync for large datasets
   - Maintain backup procedures
   - Document custom configurations
