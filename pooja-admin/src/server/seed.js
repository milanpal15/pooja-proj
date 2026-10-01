import 'dotenv/config';
import mongoose from 'mongoose';

import { connectDb } from './db.js';
import { Event, Payment, Visitor } from './models.js';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/pooja_admin';

const SCREENS = ['/', '/pooja', '/temples', '/bhajan', '/profile', '/chadhava', '/journal', '/darshan'];
const MODELS = ['motorola edge 60 pro', 'Pixel 8', 'iPhone 15', 'OnePlus 12', 'Galaxy S24'];

function rand(n) {
  return Math.floor(Math.random() * n);
}

async function run() {
  await connectDb(MONGODB_URI);
  await Promise.all([Visitor.deleteMany({}), Event.deleteMany({}), Payment.deleteMany({})]);

  const now = Date.now();
  for (let v = 0; v < 24; v++) {
    const deviceId = `dev_${v}_${rand(1e6)}`;
    const sessions = 1 + rand(8);
    const firstSeen = new Date(now - rand(14) * 864e5);
    await Visitor.create({
      deviceId,
      model: MODELS[rand(MODELS.length)],
      os: rand(2) ? 'android' : 'ios',
      appVersion: '1.0.0',
      sessions,
      firstSeen,
      lastActive: new Date(now - rand(72) * 36e5),
    });
    for (let s = 0; s < sessions; s++) {
      const at = new Date(firstSeen.getTime() + rand(14) * 864e5);
      await Event.create({ type: 'session', deviceId, at });
      for (let k = 0; k < 2 + rand(6); k++) {
        await Event.create({ type: 'screen', deviceId, screen: SCREENS[rand(SCREENS.length)], at });
      }
    }
    if (rand(3) === 0) {
      const ok = rand(10) > 1;
      await Payment.create({
        deviceId,
        amount: [51, 101, 251, 501][rand(4)] + 5,
        method: rand(2) ? 'UPI' : 'Card',
        status: ok ? 'success' : 'failed',
        note: 'flowers · Kashi Vishwanath',
        at: new Date(now - rand(10) * 864e5),
      });
    }
  }

  console.log('✓ Seeded demo visitors, events and payments.');
  await mongoose.disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
