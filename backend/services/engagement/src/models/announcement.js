import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/** A broadcast announcement (collection `announcements`). See pooja-api's announcement.model.js for the rationale. */
const announcementSchema = new Schema(
  {
    title: { type: String, required: true },
    bodyMd: String,
    /** info | festival | urgent */
    severity: { type: String, default: 'info' },
    active: { type: Boolean, default: true },
    /** modal (full-screen on next open) and/or push (Expo push at publish time). */
    channels: { type: [String], default: ['modal'] },
    pushedAt: Date,
    pushStats: { sent: Number, failed: Number },
    startsAt: Date,
    endsAt: Date,
    dismissible: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export const Announcement = model('Announcement', announcementSchema);
