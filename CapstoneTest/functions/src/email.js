// functions/src/email.js
const functions = require('firebase-functions');
const nodemailer = require('nodemailer');

// Configure the email transport using nodemailer
const transporter = nodemailer.createTransport({
  host: functions.config().email.smtp.host,
  port: functions.config().email.smtp.port,
  secure: true,
  auth: {
    user: functions.config().email.smtp.user,
    pass: functions.config().email.smtp.pass,
  },
});

// Cloud Function to send emails
exports.sendEmail = functions.https.onCall(async (data, context) => {
  // Verify authentication
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'You must be authenticated to send emails.'
    );
  }

  try {
    const { to, subject, text, html } = data;

    // Validate required fields
    if (!to || !subject || !text) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Missing required email fields.'
      );
    }

    // Send email
    const result = await transporter.sendMail({
      from: `"HR System" <${functions.config().email.from}>`,
      to,
      subject,
      text,
      html: html || text,
    });

    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error('Email send error:', error);
    throw new functions.https.HttpsError(
      'internal',
      'Failed to send email.',
      error
    );
  }
});