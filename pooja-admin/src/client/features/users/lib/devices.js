import { localInputToIso } from '../../../lib/dates.js';
import { counter, validateBlock } from './block.js';

/** The device-block form: the same words as a user block plus the device id (docs/USERS.md §2 `POST /admin/blocked-devices`). */
export const blankDeviceForm = (deviceId = '') => ({ deviceId, reason: '', message: '', messageHi: '', mode: 'forever', until: '' });

export function validateDeviceBlock(form, now = new Date()) {
  const e = validateBlock(form, now);
  if (!form.deviceId.trim()) e.deviceId = 'Enter the device id.';
  else if (form.deviceId.trim().length > 128 || /\s/.test(form.deviceId.trim())) e.deviceId = 'A device id has no spaces and is at most 128 characters.';
  return e;
}

export function toDeviceBody(form) {
  const body = { deviceId: form.deviceId.trim(), reason: form.reason.trim(), message: form.message.trim(), until: form.mode === 'until' ? localInputToIso(form.until) : null };
  if (form.messageHi.trim()) body.messageHi = form.messageHi.trim();
  return body;
}

export { counter };
