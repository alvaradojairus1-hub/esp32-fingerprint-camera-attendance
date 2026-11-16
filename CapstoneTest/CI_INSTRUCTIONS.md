# FasTap CI/CD Configuration

This guide explains how to set up Continuous Integration/Continuous Deployment (CI/CD) for FasTap using GitHub Actions. The main workflow processes pending attendance records and manages employee data synchronization.

## 1. Firebase Service Account Setup

1. Navigate to Firebase Console
2. Go to Project Settings → Service Accounts
3. Click "Generate New Private Key"
4. Save the JSON file securely (do NOT commit to version control)

## 2. Configure GitHub Actions
- Repository -> Settings -> Secrets -> Actions
- Add the following secrets:
  - FIREBASE_SA_KEY : Copy the whole JSON contents of the service account file
  - FIREBASE_PROJECT_ID : Your Firebase project id (e.g. my-project-id)
  - PROCESS_PENDING_DRY_RUN : optional, set to 'true' to make the workflow run in dry-run mode

## 3. Workflow Verification

1. After configuring the secrets, go to the Actions tab in GitHub
2. Monitor the first automated run or trigger it manually
3. The workflow will create an artifact named `pending-attendance-summary` with the processing results
4. Review the workflow logs and artifact contents

## Security Best Practices

1. Service Account Security
   - Use principle of least privilege
   - Grant only necessary database permissions
   - Rotate keys regularly (recommended: every 90 days)
   - Remove unused service accounts and keys

2. GitHub Secrets Management
   - Never expose secrets in logs or code
   - Regularly audit access to repository secrets
   - Use environment-specific secrets when needed

3. Workflow Security
   - Enable required reviewers for workflow changes
   - Monitor workflow run history
   - Set up alerts for workflow failures

## Additional Configuration

You can customize the workflow by:
- Adjusting the schedule in `.github/workflows/process-attendance.yml`
- Adding notification webhooks for important events
- Configuring additional CI/CD steps for deployment
- Setting up staging/production environment distinctions

For detailed workflow customization, see our [Workflow Configuration Guide](./docs/WORKFLOW_CONFIG.md).

