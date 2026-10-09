// Structure tests — no database. Guard the things the module split could silently break.
import assert from 'node:assert/strict';
import test from 'node:test';

import mongoose from 'mongoose';

import { allowedOrigins } from '../../config/cors.js';
import { DEFAULT_FLAGS } from '../../models.js';
import { RESOURCES } from './index.js';

test('the content router serves the same resources, in the same order, at the same paths', () => {
  assert.deepEqual(
    RESOURCES.map((r) => r.path),
    ['/deities', '/temples', '/aartis', '/festivals', '/sevas', '/knowledge', '/faqs', '/hero',
      '/reminders', '/tones', '/wallpaper-styles', '/settings', '/horoscopes', '/panchangs', '/announcements'],
  );
});

test('the models barrel registers every collection the API owned before the split', () => {
  assert.deepEqual(
    mongoose.modelNames().filter((n) => !['Astrologer', 'CallSession', 'ChadhavaCategory', 'ChadhavaListing', 'ChadhavaOrder', 'HomeSection', 'Pooja', 'PoojaReview', 'CoinOrder', 'CoinPack', 'Offering', 'Payout', 'AstrologerEarning', 'Wallet', 'WalletTxn'].includes(n)).sort(),
    ['Aarti', 'Announcement', 'AuditLog', 'Booking', 'Deity', 'Event', 'Faq', 'Festival', 'Flag', 'HeroSlide', 'Horoscope',
      'Knowledge', 'Operator', 'Panchang', 'Policy', 'Reminder', 'Setting', 'Seva', 'Temple', 'Tone',
      'User', 'Visitor', 'WallpaperStyle'],
  );
  assert.ok(DEFAULT_FLAGS.some((f) => f.key === 'phoneAuth' && f.enabled === false));
});

test('CORS origins are normalised: bare hosts get https, trailing slashes go', () => {
  assert.deepEqual(allowedOrigins('a.onrender.com, https://b.io/ ,,http://c.dev//'), [
    'https://a.onrender.com', 'https://b.io', 'http://c.dev',
  ]);
});
