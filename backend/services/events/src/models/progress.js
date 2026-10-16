// Registration, the completion engine's records (task progress, milestone / event results), photos, signals. The indexes
// are the exactly-once guarantees the engine leans on (docs/EVENTS.md sections 1 and 10).
import mongoose from 'mongoose';

const { Mixed } = mongoose.Schema.Types;
const make = (name, schema) => mongoose.models[name] || mongoose.model(name, schema);

const registration = new mongoose.Schema(
  {
    uid: { type: String, required: true },
    eventSlug: { type: String, required: true },
    status: { type: String, enum: ['pending', 'joined', 'cancelled'], default: 'pending' },
    passCode: { type: String, default: '' },
    answers: { type: Mixed, default: {} },
    paidKey: { type: String, default: '' },
    checkedInAt: { type: Date, default: null },
    joinedAt: { type: Date, default: null },
  },
  { timestamps: true, minimize: false },
);
registration.index({ uid: 1, eventSlug: 1 }, { unique: true });
registration.index({ eventSlug: 1, status: 1, _id: 1 });
registration.index({ eventSlug: 1, passCode: 1 }, { unique: true, partialFilterExpression: { passCode: { $gt: '' } } });

const intent = new mongoose.Schema(
  {
    uid: { type: String, required: true },
    eventSlug: { type: String, required: true },
    requestId: { type: String, required: true },
    state: { type: String, enum: ['debited', 'refunded', 'done'], default: 'debited' },
  },
  { timestamps: true },
);
intent.index({ uid: 1, eventSlug: 1, requestId: 1 }, { unique: true });

const taskProgress = new mongoose.Schema(
  {
    uid: { type: String, required: true },
    eventSlug: { type: String, required: true },
    milestoneKey: { type: String, required: true },
    taskKey: { type: String, required: true },
    state: { type: Mixed, default: {} },
    completedAt: { type: Date, default: null },
    how: { type: Mixed, default: null }, // { en, hi }
    source: { type: String, enum: ['app', 'signal', 'volunteer', 'operator-approval'], default: 'app' },
    /** Optimistic-concurrency counter: every accepted write is `findOneAndUpdate({ _id, rev }, { $inc: { rev: 1 } })`. */
    rev: { type: Number, default: 0 },
  },
  { timestamps: true, minimize: false },
);
taskProgress.index({ uid: 1, eventSlug: 1, milestoneKey: 1, taskKey: 1 }, { unique: true });
taskProgress.index({ eventSlug: 1, uid: 1 });

/**
 * A coin credit the wallet still has to confirm. Written WITH the result (one insert), so a completion can never exist without its
 * credit being owed; the same `key` is sent on every retry, so the wallet moves the money once.
 */
const pendingCredit = new mongoose.Schema(
  {
    key: { type: String, required: true },
    amount: { type: Number, required: true },
    status: { type: String, enum: ['pending', 'credited'], default: 'pending' },
    attempts: { type: Number, default: 0 },
    lastError: { type: String, default: '' },
    lastAttemptAt: { type: Date, default: null },
    creditedAt: { type: Date, default: null },
  },
  { _id: false },
);

const milestoneResult = new mongoose.Schema(
  {
    uid: { type: String, required: true },
    eventSlug: { type: String, required: true },
    milestoneKey: { type: String, required: true },
    completedAt: { type: Date, default: () => new Date() },
    coinsKey: { type: String, default: '' },
    pendingCredits: { type: [pendingCredit], default: [] },
    /** Badges this completion earns; `badgesDone` flips once every one is in UserBadge (the sweeper finishes a crashed grant). */
    badgeSlugs: { type: [String], default: [] },
    badgesDone: { type: Boolean, default: true },
  },
  { timestamps: false },
);
milestoneResult.index({ uid: 1, eventSlug: 1, milestoneKey: 1 }, { unique: true });
milestoneResult.index({ eventSlug: 1, milestoneKey: 1 });
milestoneResult.index({ 'pendingCredits.status': 1 }, { sparse: true });
milestoneResult.index({ badgesDone: 1 }, { partialFilterExpression: { badgesDone: false } });

const eventResult = new mongoose.Schema(
  {
    uid: { type: String, required: true },
    eventSlug: { type: String, required: true },
    completedAt: { type: Date, default: () => new Date() },
    pendingCredits: { type: [pendingCredit], default: [] },
    badgeSlugs: { type: [String], default: [] },
    badgesDone: { type: Boolean, default: true },
  },
  { timestamps: false },
);
eventResult.index({ uid: 1, eventSlug: 1 }, { unique: true });
eventResult.index({ 'pendingCredits.status': 1 }, { sparse: true });
eventResult.index({ badgesDone: 1 }, { partialFilterExpression: { badgesDone: false } });

const photo = new mongoose.Schema(
  {
    uid: { type: String, required: true },
    eventSlug: { type: String, required: true },
    milestoneKey: { type: String, required: true },
    taskKey: { type: String, required: true },
    media: { type: String, required: true },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    reviewedBy: { type: String, default: '' },
  },
  { timestamps: true },
);
photo.index({ uid: 1, eventSlug: 1, milestoneKey: 1, taskKey: 1 }, { unique: true });

/** A replayed signal lands once: unique (uid, kind, ref), expiring after 400 days. */
const signal = new mongoose.Schema(
  {
    uid: { type: String, required: true },
    kind: { type: String, required: true },
    ref: { type: String, required: true },
    qty: { type: Number, default: 1 },
    at: { type: Date, default: () => new Date() },
  },
  { timestamps: false },
);
signal.index({ uid: 1, kind: 1, ref: 1 }, { unique: true });
signal.index({ at: 1 }, { expireAfterSeconds: 400 * 24 * 3600 });

/**
 * Seats taken per event: the ATOMIC capacity gate. `taken` is bumped with a conditional update (`taken < capacity`), so two joins can
 * never both take the last seat; a leave gives one back. The shown `registered` count is always counted from Registration rows.
 */
const seats = new mongoose.Schema({ eventSlug: { type: String, required: true, unique: true }, taken: { type: Number, default: 0 } }, { timestamps: false });

export const Seats = make('Seats', seats);
export const Registration = make('Registration', registration);
export const Intent = make('Intent', intent);
export const TaskProgress = make('TaskProgress', taskProgress);
export const MilestoneResult = make('MilestoneResult', milestoneResult);
export const EventResult = make('EventResult', eventResult);
export const PhotoSubmission = make('PhotoSubmission', photo);
export const Signal = make('Signal', signal);
