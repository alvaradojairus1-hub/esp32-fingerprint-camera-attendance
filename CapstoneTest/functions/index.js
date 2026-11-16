// Entry point for Cloud Functions
// Require individual function modules so firebase-tools can deploy them

const approveEnrollment = require('./src/approveEnrollment');
const email = require('./src/email');
// Re-export functions
exports.approveEnrollment = approveEnrollment.approveEnrollment;
exports.sendEmail = email.sendEmail;
// createAuthUser removed (no server-side functions will be deployed on Spark plan)
