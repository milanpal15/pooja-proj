import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/** A deity (god) shown in the app, with a manageable image. */
const deitySchema = new Schema(
  {
    slug: { type: String, required: true, unique: true, index: true },
    name: String, // e.g. शिव जी
    title: String, // e.g. भगवान शिव
    mark: String, // ॐ
    mantra: String,
    imageUrl: String, // uploaded or external
    accent: { type: String, default: '#FFC13D' }, // halo + glow
    /**
     * What the devotee may offer. Was compiled into the app.
     */
    offerings: { type: [String], default: undefined },

    /**
     * How the sanctum DRAWS this deity when there is no photograph.
     *
     * The app renders a procedural murti — a figure built from shapes and
     * tinted by these — and falls back to it whenever `imageUrl` is unset.
     * These lived in the app bundle, which meant adding a deity from the
     * dashboard produced an untinted, crownless figure. Blank is fine: the
     * app keeps its own defaults for anything absent.
     */
    body: String, // skin / murti tone
    robe: String,
    trim: String, // garlands, crown, jewellery
    crown: String, // 'jata' | 'mukut' | 'crown' | 'none' — see the app's CrownKind
    crescent: Boolean, // moon in the hair (Shiva)
    serpent: Boolean, // cobra at the shoulder (Shiva)
    elephant: Boolean, // elephant head (Ganesha)
    mace: Boolean, // gada at the side (Hanuman)

    order: { type: Number, default: 0 },
    enabled: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export const Deity = model('Deity', deitySchema);
