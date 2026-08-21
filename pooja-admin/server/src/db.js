import mongoose from 'mongoose';

import { seedPolicies } from './broadcast.js';
import { Aarti, Deity, DEFAULT_FLAGS, Flag, Temple } from './models.js';

export async function connectDb(uri) {
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri);
  console.log('✓ MongoDB connected:', uri);
  await seedFlags();
  await seedContent();
  await backfillBookingFlag();
  await seedPolicies();
}

/** Insert any missing default flags (idempotent). */
async function seedFlags() {
  for (const f of DEFAULT_FLAGS) {
    await Flag.updateOne({ key: f.key }, { $setOnInsert: f }, { upsert: true });
  }
}

const DEITIES = [
  { slug: 'shiva', name: 'शिव जी', title: 'भगवान शिव', mark: 'ॐ', mantra: 'ॐ नमः शिवाय', accent: '#FFC13D', order: 0 },
  { slug: 'shani', name: 'शनि देव', title: 'शनि देव', mark: 'शं', mantra: 'ॐ शं शनैश्चराय नमः', accent: '#63B3ED', order: 1 },
  { slug: 'vishnu', name: 'विष्णु जी', title: 'भगवान विष्णु', mark: 'हरि', mantra: 'ॐ नमो नारायणाय', accent: '#F6E05E', order: 2 },
  { slug: 'ganesh', name: 'गणेश जी', title: 'श्री गणेश', mark: 'श्री', mantra: 'ॐ गं गणपतये नमः', accent: '#FF9F45', order: 3 },
  { slug: 'hanuman', name: 'हनुमान जी', title: 'श्री हनुमान', mark: 'राम', mantra: 'ॐ हनुमते नमः', accent: '#FF8A3D', order: 4 },
  { slug: 'durga', name: 'दुर्गा माँ', title: 'माँ दुर्गा', mark: 'ऐं', mantra: 'ॐ दुं दुर्गायै नमः', accent: '#F06595', order: 5 },
  { slug: 'lakshmi', name: 'लक्ष्मी माँ', title: 'माँ लक्ष्मी', mark: 'श्रीं', mantra: 'ॐ श्रीं महालक्ष्म्यै नमः', accent: '#FFD166', order: 6 },
  { slug: 'krishna', name: 'कृष्ण जी', title: 'श्री कृष्ण', mark: 'कृष्ण', mantra: 'ॐ नमो भगवते वासुदेवाय', accent: '#7DD3C0', order: 7 },
];

const TEMPLES = [
  { slug: 'kashi', name: 'Kashi Vishwanath', location: 'Varanasi, Uttar Pradesh', deitySlug: 'shiva', aartiTime: 'Mangala Aarti · 3:00 AM', offerings: ['Bilva Patra', 'Ganga Jal', 'Dhatura'], order: 0 },
  { slug: 'siddhivinayak', name: 'Shree Siddhivinayak', location: 'Prabhadevi, Mumbai', deitySlug: 'ganesh', aartiTime: 'Kakad Aarti · 5:30 AM', offerings: ['Modak', 'Durva Grass', 'Red Hibiscus'], order: 1 },
  { slug: 'meenakshi', name: 'Meenakshi Amman', location: 'Madurai, Tamil Nadu', deitySlug: 'durga', aartiTime: 'Palliyarai Pooja · 9:30 PM', offerings: ['Kumkum', 'Jasmine', 'Sarees'], order: 2 },
  { slug: 'jagannath', name: 'Jagannath Dham', location: 'Puri, Odisha', deitySlug: 'vishnu', aartiTime: 'Sandhya Aarti · 7:00 PM', offerings: ['Tulsi Leaves', 'Mahaprasad', 'Chandan'], order: 3 },
  { slug: 'tirupati', name: 'Tirumala Balaji', location: 'Tirumala, Andhra Pradesh', deitySlug: 'vishnu', aartiTime: 'Suprabhata Seva · 4:30 AM', offerings: ['Tulsi Mala', 'Laddu', 'Chandan'], order: 4 },
];

const AARTIS = [
  { title: 'Om Jai Jagdish Hare', artist: 'Anup Jalota', duration: '5:10', order: 0 },
  { title: 'Hanuman Chalisa', artist: 'Hariharan', deitySlug: 'hanuman', duration: '7:30', order: 1 },
  { title: 'Gayatri Mantra', artist: 'Suresh Wadkar', duration: '6:15', order: 2 },
  { title: 'Shiv Tandav Stotram', artist: 'Shankar Mahadevan', deitySlug: 'shiva', duration: '8:02', order: 3 },
  { title: 'Achyutam Keshavam', artist: 'Vivek Prakash', deitySlug: 'vishnu', duration: '5:45', order: 4 },
  { title: 'Aigiri Nandini', artist: 'Rajalakshmee', deitySlug: 'durga', duration: '6:30', order: 5 },
];

/**
 * Backfill `bookingEnabled` on temples created before the field existed.
 *
 * A Mongoose `default` only applies to new documents, so without this the
 * dashboard's new toggle reads as unset on every existing temple. Idempotent —
 * it only touches documents where the field is genuinely absent.
 *
 * This belongs in a versioned migration rather than in startup, which is
 * defect 10 in the low-level design; it lives here to match the pattern the
 * rest of this file already uses.
 */
async function backfillBookingFlag() {
  const res = await Temple.updateMany(
    { bookingEnabled: { $exists: false } },
    { $set: { bookingEnabled: true } },
  );
  if (res.modifiedCount) console.log(`✓ backfilled bookingEnabled on ${res.modifiedCount} temples`);
}

/** Seed default content only when a collection is empty. */
async function seedContent() {
  if ((await Deity.countDocuments()) === 0) await Deity.insertMany(DEITIES);
  if ((await Temple.countDocuments()) === 0) await Temple.insertMany(TEMPLES);
  if ((await Aarti.countDocuments()) === 0) await Aarti.insertMany(AARTIS);
}
