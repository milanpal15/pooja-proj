/**
 * The task-kind registry (docs/EVENTS.md section 4). A kind is ONE module in this folder exporting
 *   { kind, title, interactive, minAppVersion, configSchema, signals, validate(config) -> { config, errors, refs },
 *     evaluate(state, report, ctx) -> { state, done, how }, summary(config, lang) }
 * and is listed here. Nothing outside this folder knows what a kind does: event validation, the dashboard's rule builder
 * (GET /admin/events/task-kinds) and the completion engine all read the registry.
 */
import bhajanListened from './bhajan-listened.js';
import chadhavaOffered from './chadhava-offered.js';
import counter from './counter.js';
import liveDarshan from './live-darshan.js';
import location from './location.js';
import photo from './photo.js';
import poojaBooked from './pooja-booked.js';
import qrCheckin from './qr-checkin.js';
import selfMark from './self-mark.js';

export { NotImplementedError } from './kit.js';

const MODULES = [selfMark, counter, liveDarshan, bhajanListened, chadhavaOffered, poojaBooked, location, qrCheckin, photo];

export const TASK_KINDS = Object.freeze(Object.fromEntries(MODULES.map((m) => [m.kind, m])));

export const getKind = (kind) => (typeof kind === 'string' && Object.hasOwn(TASK_KINDS, kind) ? TASK_KINDS[kind] : null);

/** What the dashboard's rule builder reads (no behaviour, JSON only). */
export const listKinds = () =>
  MODULES.map(({ kind, title, configSchema, signals, interactive, minAppVersion }) => ({ kind, title, configSchema, signals, interactive, minAppVersion }));
