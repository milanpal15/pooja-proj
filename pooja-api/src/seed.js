import 'dotenv/config';
import mongoose from 'mongoose';

import { config } from './config/env.js';
import { connectDb } from './db/connect.js';
import { Event, Visitor } from './models.js';


const SCREENS = ['/', '/pooja', '/temples', '/bhajan', '/profile', '/chadhava', '/journal', '/darshan'];
const MODELS = ['motorola edge 60 pro', 'Pixel 8', 'iPhone 15', 'OnePlus 12', 'Galaxy S24'];

function rand(n) {
  return Math.floor(Math.random() * n);
}

async function run() {
  await connectDb(config.mongodbUri);
  await Promise.all([Visitor.deleteMany({}), Event.deleteMany({})]);

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
  }

  console.log('✓ Seeded demo visitors and events.');
  await mongoose.disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
