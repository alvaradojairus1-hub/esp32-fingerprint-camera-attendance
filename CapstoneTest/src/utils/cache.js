// src/utils/cache.js
class SimpleCache {
  constructor(maxSize = 100, ttl = 5 * 60 * 1000) { // Default 5 minutes TTL
    this.cache = new Map();
    this.maxSize = maxSize;
    this.ttl = ttl;
  }

  set(key, value) {
    // Evict oldest entries if cache is full
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }

    this.cache.set(key, {
      value,
      timestamp: Date.now()
    });
  }

  get(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // Check if entry has expired
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.value;
  }

  clear() {
    this.cache.clear();
  }

  delete(key) {
    this.cache.delete(key);
  }
}

// Create singleton cache instances for different data types
const userCache = new SimpleCache(50, 5 * 60 * 1000); // 5 minutes TTL for users
const attendanceCache = new SimpleCache(100, 30 * 1000); // 30 seconds TTL for attendance
const leaveRequestCache = new SimpleCache(100, 60 * 1000); // 1 minute TTL for leave requests

export const cache = {
  users: userCache,
  attendance: attendanceCache,
  leaveRequests: leaveRequestCache
};