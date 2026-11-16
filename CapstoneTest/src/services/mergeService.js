// src/services/mergeService.js
// Resolves the Apps Script merge URL and triggers a merge request.

import { getDatabase, ref, get, child } from 'firebase/database';
import { database } from '../firebase';
import appsScriptConfig from '../config/appsScriptConfig';
import { firebaseService } from './firebaseService';

const DEFAULT_TIMEOUT = 15000; // 15s

async function resolveMergeUrl() {
  // First try the Realtime DB at /appConfig/mergeApiUrl
  try {
    const db = database; // already initialized in src/firebase.js
    const snap = await get(ref(db, '/appConfig/mergeApiUrl'));
    if (snap && snap.exists()) {
      const val = snap.val();
      if (typeof val === 'string' && val.trim()) return val.trim();
    }
  } catch (e) {
    // ignore DB errors here; we'll fallback to env
    console.warn('Could not read /appConfig/mergeApiUrl from DB:', e.message || e);
  }

  // Next try env config (Vite)
  if (appsScriptConfig && appsScriptConfig.envUrl) {
    return appsScriptConfig.envUrl;
  }

  // Finally fallback constant
  if (appsScriptConfig && appsScriptConfig.fallbackUrl) {
    return appsScriptConfig.fallbackUrl;
  }

  throw new Error('Apps Script merge URL not configured. Set /appConfig/mergeApiUrl in the DB or VITE_APPS_SCRIPT_MERGE_URL in env.');
}

export async function mergeNow({ timeoutMs = DEFAULT_TIMEOUT } = {}) {
  const url = await resolveMergeUrl();
  // Also try to read a merge token from the realtime DB (/appConfig/mergeToken)
  let token = null;
  try {
    const snap = await get(ref(database, '/appConfig/mergeToken'));
    if (snap && snap.exists()) {
      const val = snap.val();
      if (typeof val === 'string' && val.trim()) token = val.trim();
    }
  } catch (e) {
    // ignore
  }

  // build final request URL and include token if available
  let requestUrl = url;
  try {
    if (token) {
      // if url already has query params, append using &
      requestUrl = url + (url.indexOf('?') === -1 ? `?_token=${encodeURIComponent(token)}` : `&amp;_token=${encodeURIComponent(token)}`);
    }
  } catch (e) { /* ignore */ }
  // Console log for local debugging
  console.log('mergeNow: resolved merge URL ->', requestUrl);
  // Audit: record that a merge was requested from the client
  try {
    await firebaseService.writeAuditLog({ action: 'mergeNow', status: 'started', requestUrl });
  } catch (e) {
    // don't block merge on audit log failures
    console.warn('writeAuditLog failed (merge start)', e);
  }
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(requestUrl, {
      method: 'GET',
      mode: 'cors',
      signal: controller.signal
    });
    clearTimeout(id);

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Merge failed: ${res.status} ${res.statusText} ${text}`);
    }

    // Apps Script web app may return text/plain or JSON. Try JSON, fallback to text.
    let data;
    try {
      data = await res.json();
    } catch (e) {
      data = { message: await res.text().catch(() => '') };
    }

    // Audit: record successful merge response
    try {
      await firebaseService.writeAuditLog({ action: 'mergeNow', status: 'success', response: data });
    } catch (e) {
      console.warn('writeAuditLog failed (merge success)', e);
    }

    return { ok: true, data };
  } catch (err) {
    // Record audit log for failure
    try {
      await firebaseService.writeAuditLog({ action: 'mergeNow', status: 'error', error: err && err.message ? String(err.message) : String(err) });
    } catch (e) {
      console.warn('writeAuditLog failed (merge error)', e);
    }

    if (err.name === 'AbortError') {
      throw new Error('Merge request timed out');
    }
    throw err;
  }
}
