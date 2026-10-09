import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * A broadcast announcement, shown to every devotee as a full-screen modal.
 *
 * `active` is the switch; `startsAt`/`endsAt` let a festival notice be
 * scheduled rather than remembered. Devotees dismiss by id, so re-enabling an
 * old announcement does not re-show it to people who already saw it — publish
 * a new one instead.
 */
const announcementSchema = new Schema(
  {
    title: { type: String, required: true },
    bodyMd: String,
    /** info | festival | urgent — drives the modal's accent, not its layout. */
    severity: { type: String, default: 'info' },
    active: { type: Boolean, default: true },
    /**
     * How this reaches devotees. Both may be set.
     *   modal — full-screen takeover on next app open
     *   push  — Expo push notification, sent once at publish time
     */
    channels: { type: [String], default: ['modal'] },
    /** Stamped when the push fan-out ran, so publishing twice cannot double-send. */
    pushedAt: Date,
    pushStats: { sent: Number, failed: Number },
    startsAt: Date,
    endsAt: Date,
    /** A non-dismissible notice still closes; it just cannot be swiped away. */
    dismissible: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export const Announcement = model('Announcement', announcementSchema);
