// src/utils/syncErrors.js

export const SyncErrorTypes = {
  CONNECTION: 'connection',
  VALIDATION: 'validation',
  DATABASE: 'database',
  AUTHENTICATION: 'authentication',
  UNKNOWN: 'unknown'
};

export class SyncError extends Error {
  constructor(type, message, details = null) {
    super(message);
    this.type = type;
    this.details = details;
    this.timestamp = new Date();
  }
}

export const getSyncErrorMessage = (error) => {
  switch (error.type) {
    case SyncErrorTypes.CONNECTION:
      return 'Failed to connect to the server. Please check your internet connection.';
    case SyncErrorTypes.VALIDATION:
      return 'Invalid attendance data received. Please try again.';
    case SyncErrorTypes.DATABASE:
      return 'Database operation failed. Please try again later.';
    case SyncErrorTypes.AUTHENTICATION:
      return 'Authentication error. Please log in again.';
    default:
      return error.message || 'An unexpected error occurred.';
  }
};

export const getSyncErrorSeverity = (error) => {
  switch (error.type) {
    case SyncErrorTypes.CONNECTION:
      return 'warning';
    case SyncErrorTypes.VALIDATION:
      return 'info';
    case SyncErrorTypes.DATABASE:
      return 'error';
    case SyncErrorTypes.AUTHENTICATION:
      return 'error';
    default:
      return 'error';
  }
};