import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * An operator-defined role (docs/ROLES.md section 1). Only CUSTOM roles live here: `admin`, `editor` and `viewer` are code-defined presets
 * (common/operator/access/permissions.js) and are never stored, so they can never drift or be edited into something else.
 */
const roleSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, trim: true, lowercase: true },
    name: { type: String, required: true, trim: true, maxlength: 40 },
    description: { type: String, default: '', trim: true, maxlength: 160 },
    /** `<area>:view` / `<area>:edit`, normalised (edit stores view too). */
    permissions: { type: [String], default: [] },
    createdBy: String,
    updatedBy: String,
  },
  { timestamps: true },
);

export const Role = model('Role', roleSchema);
