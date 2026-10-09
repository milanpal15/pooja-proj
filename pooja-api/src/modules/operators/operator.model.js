import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * Someone who signs in to the dashboard. NOT a devotee.
 *
 * `User` in this file is a devotee of the app, keyed by Firebase uid. This
 * is the operator: the person writing horoscopes or managing temples. The
 * two were never the same thing, and conflating them would mean a devotee
 * account could be escalated into dashboard access.
 *
 * Replaces the single shared ADMIN_PASSWORD. A shared password cannot carry
 * a role and cannot say who changed what.
 */
const operatorSchema = new Schema(
  {
    username: { type: String, required: true, unique: true, index: true, lowercase: true, trim: true },
    /** scrypt, as `scrypt$<salt-hex>$<hash-hex>`. Never the password itself. */
    passwordHash: { type: String, required: true },
    /**
     * `admin` may do anything, including managing operators, devotees,
     * feature flags and payments. `editor` may write content — deities,
     * temples, horoscope, festivals, announcements — and can look at, but
     * not change, the rest. `viewer` is read-only. What each holds lives in
     * access/permissions.js (DESIGN.md §21).
     * The split that matters: whoever writes the daily reading has no
     * business being able to delete a devotee's account.
     */
    role: { type: String, enum: ['admin', 'editor', 'viewer'], default: 'editor', index: true },
    /** Suspends sign-in without deleting the record or its history. */
    active: { type: Boolean, default: true },
    lastLogin: Date,
  },
  { timestamps: true },
);

export const Operator = model('Operator', operatorSchema);
