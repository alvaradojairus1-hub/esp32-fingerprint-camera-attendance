import { firebaseService } from './firebaseService';
import { database, dbRef } from '../firebase';
import { ref, get, update, push, query, orderByChild, equalTo } from 'firebase/database';
import { sendLeaveRequestEmail } from './emailService';

// Leave Types with their properties
export const LEAVE_TYPES = {
  VACATION: {
    id: 'vacation_leave',
    name: 'Vacation Leave',
    description: 'For personal time off and recreation',
    defaultBalance: 15, // days per year
    requiresDocument: false,
    minAdvanceNotice: 7 // days
  },
  SICK: {
    id: 'sick_leave',
    name: 'Sick Leave',
    description: 'For medical conditions and recovery',
    defaultBalance: 15,
    requiresDocument: true,
    minAdvanceNotice: 0,
  },
  EMERGENCY: {
    id: 'emergency_leave',
    name: 'Emergency Leave',
    description: 'For urgent personal or family matters',
    defaultBalance: 5,
    requiresDocument: true,
    minAdvanceNotice: 0,
  },
  MATERNITY: {
    id: 'maternity_leave',
    name: 'Maternity Leave',
    description: 'For childbirth and maternity care',
    defaultBalance: 105, // as per Philippine law
    requiresDocument: true,
    minAdvanceNotice: 30
  },
  PATERNITY: {
    id: 'paternity_leave',
    name: 'Paternity Leave',
    description: 'For fathers after childbirth',
    defaultBalance: 7, // as per Philippine law
    requiresDocument: true,
    minAdvanceNotice: 30,
  }
};

// Leave request status types
export const LEAVE_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled'
};

const parseDate = d => {
  if (!d) return null;
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? null : dt;
};

const inclusiveDaysBetween = (start, end) => {
  const s = parseDate(start);
  const e = parseDate(end);
  if (!s || !e) return 0;
  const ms = e.setHours(0,0,0,0) - s.setHours(0,0,0,0);
  return Math.floor(ms / 86400000) + 1;
};

/**
 * Gets the current leave balance for a user
 * @param {string} userId - The user ID
 * @param {string} leaveType - The type of leave
 * @returns {Promise<number>} The current balance
 */
export const getLeaveBalance = async (userId, leaveType) => {
  try {
    // Normalize leave type to match database format
    let normalizedType = leaveType.toLowerCase();
    if (!normalizedType.endsWith('_leave')) {
      normalizedType = normalizedType.replace('_leave', '') + '_leave';
    }

    const balanceRef = ref(database, dbRef(`leaveBalances/${userId}/${normalizedType}`));
    const snapshot = await get(balanceRef);
    
    if (!snapshot.exists()) {
      // Return default balance if not yet initialized
      const typeKey = normalizedType.replace('_leave', '').toUpperCase();
      return LEAVE_TYPES[typeKey]?.defaultBalance || 0;
    }

    return snapshot.val().balance || 0;
  } catch (error) {
    console.error('Error fetching leave balance:', error);
    throw error;
  }
};

/**
 * Updates a user's leave balance
 * @param {string} userId - The user ID
 * @param {string} leaveType - The type of leave
 * @param {number} adjustment - The amount to adjust (positive or negative)
 * @returns {Promise<void>}
 */
export const updateLeaveBalance = async (userId, leaveType, adjustment) => {
  try {
    const balanceRef = ref(database, dbRef(`leaveBalances/${userId}/${leaveType}`));
    const snapshot = await get(balanceRef);
    
    const currentBalance = snapshot.exists() ? snapshot.val().balance : 
      LEAVE_TYPES[leaveType.toUpperCase()]?.defaultBalance || 0;

    await update(balanceRef, {
      balance: Math.max(0, currentBalance + adjustment),
      updatedAt: new Date().toISOString()
    });

    // Log the balance update
    await firebaseService.writeAuditLog({
      action: 'leave_balance_updated',
      userId,
      details: {
        leaveType,
        adjustment,
        newBalance: Math.max(0, currentBalance + adjustment)
      }
    });
  } catch (error) {
    console.error('Error updating leave balance:', error);
    throw error;
  }
};

/**
 * Initialize leave balances for a new user
 * @param {string} userId - The user ID
 * @returns {Promise<void>}
 */
export const initializeLeaveBalances = async (userId) => {
  try {
    const balancesRef = ref(database, dbRef(`leaveBalances/${userId}`));
    const updates = {};

    // Initialize each leave type with its default balance
    Object.values(LEAVE_TYPES).forEach(type => {
      updates[type.id] = {
        balance: type.defaultBalance,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
    });

    await update(balancesRef, updates);
    
    // Log the initialization
    await firebaseService.writeAuditLog({
      action: 'leave_balances_initialized',
      userId,
      details: updates
    });
  } catch (error) {
    console.error('Error initializing leave balances:', error);
    throw error;
  }
};

export async function approveLeave({ facultyId, requestId, approverId, decisionComment = '' }) {
  if (!requestId) throw new Error('Missing requestId');
  
  // find request (best-effort)
  const found = await firebaseService.findLeaveRequestById(requestId);
  const fid = facultyId || (found && found.facultyId) || null;
  const request = (found && found.request) || null;

  if (!request || !request.type) {
    throw new Error('Invalid leave request data');
  }

  // Compute requested days
  const daysRequested = request ? inclusiveDaysBetween(request.startDate || request.start_date, request.endDate || request.end_date) : 0;

  // Check leave balance using new balance system
  try {
    const currentBalance = await getLeaveBalance(fid, request.type);
    
    if (daysRequested > currentBalance) {
      // insufficient balance
      await firebaseService.writeNotification(fid, {
        type: 'leave',
        action: 'approve_failed',
        message: `Leave approval failed: insufficient leave balance (${currentBalance} available, ${daysRequested} requested).`,
        requestId
      });
      return { 
        success: false, 
        reason: 'insufficient_balance', 
        available: currentBalance, 
        requested: daysRequested 
      };
    }

    // Update leave request status
    const updates = {
      status: LEAVE_STATUS.APPROVED,
      decidedAt: Date.now(),
      decisionComment: decisionComment || '',
      decidedBy: approverId || ''
    };
    await firebaseService.updateLeaveRequest(fid, requestId, updates);

    // Deduct leave balance
    await updateLeaveBalance(fid, request.type, -daysRequested);

    // Write notification and audit log
    await firebaseService.writeNotification(fid, {
      type: 'leave',
      action: 'approved',
      message: `Your leave request (${requestId}) has been approved.`,
      requestId
    });

    // Send approval email
    await sendLeaveRequestEmail({
      email: request.email || (await firebaseService.getUserEmail(fid)),
      employeeName: request.employeeName || request.name || fid,
      leaveType: LEAVE_TYPES[request.type.toUpperCase()]?.name || request.type,
      startDate: request.startDate,
      endDate: request.endDate,
      decisionComment
    }, 'LEAVE_REQUEST_APPROVED');

    await firebaseService.writeAuditLog({
      action: 'approveLeave',
      requestId,
      facultyId: fid,
      approverId: approverId || '',
      daysRequested,
      leaveType: request.type,
      comment: decisionComment || '',
    });

    return { success: true };
  } catch (err) {
    await firebaseService.writeNotification(fid, {
      type: 'leave',
      action: 'approve_error',
      message: `Error approving leave request (${requestId}).`,
      requestId
    });
    return { success: false, error: String(err) };
  }
}

export async function denyLeave({ facultyId, requestId, approverId, decisionComment = '' }) {
  if (!requestId) throw new Error('Missing requestId');
  const found = await firebaseService.findLeaveRequestById(requestId);
  const fid = facultyId || (found && found.facultyId) || null;
  const request = found && found.request;

  try {
    const updates = {
      status: LEAVE_STATUS.REJECTED,
      decidedAt: Date.now(),
      decisionComment: decisionComment || '',
      decidedBy: approverId || ''
    };
    await firebaseService.updateLeaveRequest(fid, requestId, updates);

    await firebaseService.writeNotification(fid, {
      type: 'leave',
      action: 'denied',
      message: `Your leave request (${requestId}) has been denied.${decisionComment ? ` Reason: ${decisionComment}` : ''}`,
      requestId
    });

    // Send rejection email
    await sendLeaveRequestEmail({
      email: request.email || (await firebaseService.getUserEmail(fid)),
      employeeName: request.employeeName || request.name || fid,
      leaveType: LEAVE_TYPES[request.type.toUpperCase()]?.name || request.type,
      startDate: request.startDate,
      endDate: request.endDate,
      decisionComment
    }, 'LEAVE_REQUEST_REJECTED');

    await firebaseService.writeAuditLog({
      action: 'denyLeave',
      requestId,
      facultyId: fid,
      approverId: approverId || '',
      leaveType: request?.type,
      comment: decisionComment || '',
    });

    return { success: true };
  } catch (err) {
    await firebaseService.writeNotification(fid, {
      type: 'leave',
      action: 'deny_error',
      message: `Error denying leave request (${requestId}).`,
      requestId
    });
    return { success: false, error: String(err) };
  }
}

// Handle leave request submission with proper request ID generation
export async function submitLeaveRequest({ facultyId, requestId, payload }) {
  try {
    // Validate leave type
    let leaveType = payload.type?.toLowerCase();
    // If type doesn't end with '_leave', append it
    if (!leaveType.endsWith('_leave')) {
      leaveType = leaveType.replace('_leave', '') + '_leave';
    }
    
    // Convert to uppercase for LEAVE_TYPES lookup
    const leaveTypeKey = leaveType
      .replace('_leave', '')
      .toUpperCase();
    
    if (!LEAVE_TYPES[leaveTypeKey]) {
      throw new Error('Invalid leave type. Valid types are: ' + 
        Object.values(LEAVE_TYPES)
          .map(t => t.id)
          .join(', ')
      );
    }

    // Store normalized type back in payload
    payload.type = leaveType;

    // Validate dates
    const startDate = parseDate(payload.startDate || payload.start_date);
    const endDate = parseDate(payload.endDate || payload.end_date);
    if (!startDate || !endDate) {
      throw new Error('Invalid date format');
    }

    // Calculate requested days
    const daysRequested = inclusiveDaysBetween(startDate, endDate);
    if (daysRequested <= 0) {
      throw new Error('Invalid date range');
    }

    // Special handling for sick leave
    if (leaveTypeKey === 'SICK') {
      // Only require documentation for multi-day sick leave
      if (daysRequested > 1 && !payload.supportingDocument) {
        throw new Error('Medical certificate is required for sick leave longer than one day');
      }
    } else {
      // For non-sick leave types, check advance notice
      // Allow sick and emergency leaves to be backdated by skipping advance-notice enforcement
      if (leaveTypeKey !== 'SICK' && leaveTypeKey !== 'EMERGENCY') {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const daysNotice = Math.floor((startDate - today) / (1000 * 60 * 60 * 24));

        if (daysNotice < LEAVE_TYPES[leaveTypeKey].minAdvanceNotice) {
          throw new Error(`${LEAVE_TYPES[leaveTypeKey].name} requires ${LEAVE_TYPES[leaveTypeKey].minAdvanceNotice} days advance notice`);
        }
      }

      // Check if supporting document is required but missing
      if (LEAVE_TYPES[leaveTypeKey].requiresDocument && !payload.supportingDocument) {
        throw new Error(`${LEAVE_TYPES[leaveTypeKey].name} requires supporting documentation`);
      }
    }

    // Check available balance
    const currentBalance = await getLeaveBalance(facultyId, payload.type);
    if (daysRequested > currentBalance) {
      throw new Error(`Insufficient leave balance. Available: ${currentBalance} days, Requested: ${daysRequested} days`);
    }

    // Prepare updates based on the standard structure
    const updates = {
      employeeId: facultyId,
      employeeName: payload.employeeName || payload.name || '',
      startDate: payload.startDate,
      endDate: payload.endDate,
      type: payload.type.toLowerCase(),  // Remove redundant _leave suffix since it's already added
      reason: payload.reason || '',
      status: LEAVE_STATUS.PENDING,
      submittedAt: new Date().toISOString(),
      decidedAt: null,
      decisionComment: '',
      proofUrl: payload.proofDocument?.url || payload.supportingDocument?.url || '',
      proofDocument: payload.proofDocument || payload.supportingDocument || null,
      userId: payload.userId || facultyId || null  // Ensure we have a userId
    };

    // Generate new request ID if not provided
    const targetUserId = payload.employeeId || facultyId;
    if (!targetUserId) {
      throw new Error('No valid user ID found for leave request');
    }

    // Ensure we have a valid request ID
    let finalRequestId = requestId;
    let finalRef;

    if (!finalRequestId) {
      // Create a new reference with auto-generated ID under the correct path
      finalRef = push(ref(database, dbRef(`leaveRequests/${targetUserId}`)));
      finalRequestId = finalRef.key;
      console.log('Created new request with ID:', finalRequestId);
    } else {
      // Use existing reference
      finalRef = ref(database, dbRef(`leaveRequests/${targetUserId}/${finalRequestId}`));
    }

    // Write to primary location
    try {
      await update(finalRef, updates);
    } catch (err) {
      console.error('Failed to write leave request:', err);
      throw new Error('Failed to save leave request: ' + err.message);
    }
    
    // Write audit log
    await firebaseService.writeAuditLog({ 
      action: 'submitLeave', 
      facultyId, 
      requestId: finalRequestId,
      details: {
        type: payload.type,
        startDate: payload.startDate,
        endDate: payload.endDate,
        daysRequested
      }
    });

    // Write notification for HR if email is available
    const hrEmail = await firebaseService.getHREmail();
    if (hrEmail) {
      try {
        const emailResult = await sendLeaveRequestEmail({
          email: hrEmail,
          employeeName: payload.name || facultyId,
          leaveType: LEAVE_TYPES[leaveTypeKey]?.name || payload.type,
          startDate: payload.startDate,
          endDate: payload.endDate,
          reason: payload.reason
        }, 'LEAVE_REQUEST_SUBMITTED');

        // Log email status but don't fail the request
        if (!emailResult.success && !emailResult.skipped) {
          console.warn('HR notification email failed:', emailResult.error);
          await firebaseService.writeAuditLog({
            action: 'email_notification_failed',
            type: 'leave_request',
            requestId: finalRequestId,
            error: emailResult.error
          });
        }
      } catch (emailError) {
        // Log email error but continue with request
        console.error('Failed to send HR notification:', emailError);
      }
    }

    // Always write the notification even if email fails
    await firebaseService.writeNotification('hr', {
      type: 'leave',
      action: 'new_request',
      message: `New leave request from ${payload.name || facultyId}`,
      requestId: finalRequestId,
      timestamp: Date.now()
    });

    return { success: true, requestId: finalRequestId };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}
