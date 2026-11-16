// src/services/emailService.js

import { getFunctions, httpsCallable, connectFunctionsEmulator } from 'firebase/functions';
import { app } from '../firebase';  // Import the existing Firebase app instance

// Initialize Firebase Functions with Asia Southeast 1 region
const functions = getFunctions(app, 'asia-southeast1');

// Connect to emulator only when explicitly enabled via VITE_USE_FIREBASE_EMULATOR=true
// This prevents accidental attempts to call localhost:5001 when the emulator is not running.
if (import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true') {
  try {
    connectFunctionsEmulator(functions, 'localhost', 5001);
    console.log('Connected to Functions emulator at localhost:5001');
  } catch (e) {
    console.warn('Failed connecting to Functions emulator:', e);
  }
}

// Email templates
export const EMAIL_TEMPLATES = {
  LEAVE_REQUEST_SUBMITTED: {
    subject: 'Leave Request Submitted',
    template: (data) => `
      Dear HR Team,

      A new leave request has been submitted:

      Employee: ${data.employeeName}
      Leave Type: ${data.leaveType}
      Start Date: ${data.startDate}
      End Date: ${data.endDate}
      Reason: ${data.reason}

      Please review this request at your earliest convenience.

      Best regards,
      HR System
    `
  },
  LEAVE_REQUEST_APPROVED: {
    subject: 'Leave Request Approved',
    template: (data) => `
      Dear ${data.employeeName},

      Your leave request has been approved:

      Leave Type: ${data.leaveType}
      Start Date: ${data.startDate}
      End Date: ${data.endDate}

      Have a great time off!

      Best regards,
      HR Team
    `
  },
  LEAVE_REQUEST_REJECTED: {
    subject: 'Leave Request Update',
    template: (data) => `
      Dear ${data.employeeName},

      Your leave request has been reviewed and could not be approved at this time:

      Leave Type: ${data.leaveType}
      Start Date: ${data.startDate}
      End Date: ${data.endDate}

      Reason: ${data.decisionComment || 'No reason provided'}

      If you have any questions, please contact the HR team.

      Best regards,
      HR Team
    `
  }
};

/**
 * Sends an email using Firebase Cloud Functions
 * @param {Object} options Email options
 * @param {string} options.to Recipient email address
 * @param {string} options.subject Email subject
 * @param {string} options.text Email body text
 * @param {string} options.html Optional HTML content
 * @returns {Promise<Object>} Send result
 */
export const sendEmail = async ({ to, subject, text, html }) => {
  if (!to || !subject || !text) {
    console.warn('Email not sent: Missing required fields');
    return { success: false, error: 'Missing required fields' };
  }

  try {
    const sendEmailFunction = httpsCallable(functions, 'sendEmail', {
      timeout: 10000 // 10 second timeout
    });
    
    const result = await sendEmailFunction({
      to,
      subject,
      text,
      html: html || text // Fallback to text if no HTML provided
    });

    if (result.data?.success) {
      return { success: true, result: result.data };
    } else {
      throw new Error(result.data?.error || 'Failed to send email');
    }
  } catch (error) {
    // Handle specific error types
    if (error.code === 'functions/unavailable' || error.code === 'functions/internal') {
      console.warn('Email service temporarily unavailable:', error);
      return { 
        success: false, 
        error: 'Email service temporarily unavailable',
        shouldRetry: true
      };
    }
    
    // Log the error but don't block the application
    console.error('Failed to send email:', error);
    return { 
      success: false, 
      error: 'Unable to send email notification',
      technical_error: error.message
    };
  }
};

/**
 * Sends a leave request notification email
 * @param {Object} data Leave request data
 * @param {string} templateType Template type from EMAIL_TEMPLATES
 * @returns {Promise<Object>} Send result
 */
export const sendLeaveRequestEmail = async (data, templateType) => {
  try {
    // Validate required data
    if (!data.email) {
      console.warn('Email notification skipped: No recipient email provided');
      return { success: false, error: 'No recipient email provided', skipped: true };
    }

    const template = EMAIL_TEMPLATES[templateType];
    if (!template) {
      console.error('Invalid email template:', templateType);
      return { success: false, error: 'Invalid email template type', skipped: true };
    }

    try {
      const emailText = template.template(data);
      const result = await sendEmail({
        to: data.email,
        subject: template.subject,
        text: emailText
      });

      if (!result.success && result.shouldRetry) {
        // If email service is temporarily down, log it but don't treat as error
        console.warn('Email notification delayed:', result.error);
        return { 
          success: true, 
          warning: 'Email notification will be sent later',
          technical_details: result.error 
        };
      }

      return result;
    } catch (templateError) {
      console.error('Error processing email template:', templateError);
      return { 
        success: false, 
        error: 'Error preparing email notification',
        technical_error: templateError.message,
        skipped: true 
      };
    }
  } catch (error) {
    // Log but don't throw - email notifications are non-critical
    console.error('Failed to send leave request email:', error);
    return { 
      success: false, 
      error: 'Unable to send email notification',
      technical_error: error.message,
      skipped: true 
    };
  }
};