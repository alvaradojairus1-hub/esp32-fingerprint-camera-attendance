import { ref, get, set, onValue, off, update } from 'firebase/database';
import { database, dbRef } from '../firebase';

const SETTINGS_PATH = dbRef('systemSettings');

export async function fetchSystemSettings() {
  try {
    const snap = await get(ref(database, SETTINGS_PATH));
    return snap.exists() ? snap.val() : null;
  } catch (error) {
    console.error('fetchSystemSettings error', error);
    throw error;
  }
}

export function subscribeToSystemSettings(cb) {
  const r = ref(database, SETTINGS_PATH);
  const listener = onValue(r, (snap) => {
    cb(snap.val());
  });
  return () => off(r, 'value', listener);
}

export async function saveCompanyBranding(branding) {
  try {
    const brandingRef = ref(database, `${SETTINGS_PATH}/branding`);
    const payload = { ...branding, lastUpdated: new Date().toISOString() };
    await set(brandingRef, payload);
    // update lastUpdated at root settings too
    const rootRef = ref(database, SETTINGS_PATH);
    await update(rootRef, { lastUpdated: new Date().toISOString() });
    return payload;
  } catch (error) {
    console.error('saveCompanyBranding error', error);
    throw error;
  }
}

export async function updateSystemSettings(patch) {
  try {
    const rootRef = ref(database, SETTINGS_PATH);
    await update(rootRef, { ...patch, lastUpdated: new Date().toISOString() });
  } catch (error) {
    console.error('updateSystemSettings error', error);
    throw error;
  }
}

export async function saveSystemSettings(obj) {
  try {
    const rootRef = ref(database, SETTINGS_PATH);
    await set(rootRef, { ...obj, lastUpdated: new Date().toISOString() });
  } catch (error) {
    console.error('saveSystemSettings error', error);
    throw error;
  }
}

export default {
  fetchSystemSettings,
  subscribeToSystemSettings,
  saveCompanyBranding,
  updateSystemSettings,
  saveSystemSettings,
};
