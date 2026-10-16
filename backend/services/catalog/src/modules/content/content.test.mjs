// Structure tests - no database. Guard the things the service split could silently break.
import assert from 'node:assert/strict';
import test from 'node:test';

import mongoose from 'mongoose';

import '../../models.js';
import { RESOURCES } from './index.js';

test('the content router serves the same resources at the same paths as the monolith, minus settings and announcements', () => {
  assert.deepEqual(
    RESOURCES.map((r) => r.path),
    ['/deities', '/temples', '/aartis', '/festivals', '/sevas', '/knowledge', '/faqs', '/hero',
      '/reminders', '/tones', '/wallpaper-styles', '/horoscopes', '/panchangs'],
  );
});

test('the models barrel registers exactly the catalog collections (and not Setting / Booking / PoojaReview)', () => {
  assert.deepEqual(mongoose.modelNames().sort(), [
    'Aarti', 'ChadhavaCategory', 'ChadhavaListing', 'Deity', 'Faq', 'Festival', 'HeroSlide', 'Horoscope', 'HomeSection', 'HomeLayoutDraft', 'HomeLayoutVersion',
    'Knowledge', 'LiveCategory', 'LiveJaiCount', 'LiveJaiLast', 'LiveStream', 'Offering', 'Panchang', 'PlaceCache', 'Pooja', 'Reminder',
    'Seva', 'Temple', 'Tone', 'WallpaperStyle',
  ].sort());
});
