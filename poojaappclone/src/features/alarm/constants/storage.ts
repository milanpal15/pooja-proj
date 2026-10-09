import type { ReminderState } from '../types';

export const KEY = 'pooja.reminders';

export const EMPTY: ReminderState = { enabled: {}, times: {}, custom: [], removed: [], tone: 'bell' };
