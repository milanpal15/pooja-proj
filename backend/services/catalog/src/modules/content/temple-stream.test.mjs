import assert from 'node:assert/strict';
import { test } from 'node:test';

import { normalizeStreamUrl, unwrapEmbed, youTubeId } from '../../lib/stream-url.js';
import { prepareTemple } from './resources/temple.resource.js';

const IFRAME =
  '<iframe width="560" height="315" src="https://www.youtube.com/embed/iD7bdfmqzXE?si=h3h3ZKDbxB_Lnr7A" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>';
const WATCH = 'https://www.youtube.com/watch?v=iD7bdfmqzXE';

test('a pasted YouTube embed snippet becomes a plain watch link', () => {
  assert.equal(unwrapEmbed(IFRAME), 'https://www.youtube.com/embed/iD7bdfmqzXE?si=h3h3ZKDbxB_Lnr7A');
  assert.equal(normalizeStreamUrl(IFRAME), WATCH);
});

test('every YouTube shape lands on the same canonical link', () => {
  for (const u of [
    'https://www.youtube.com/watch?v=iD7bdfmqzXE&t=10s',
    'https://youtu.be/iD7bdfmqzXE?si=abc',
    'https://www.youtube.com/live/iD7bdfmqzXE?feature=share',
    'https://www.youtube.com/shorts/iD7bdfmqzXE',
    'https://www.youtube-nocookie.com/embed/iD7bdfmqzXE',
    `  ${IFRAME.replace('&', '&amp;')}  `,
    "<iframe src='https://www.youtube.com/embed/iD7bdfmqzXE'></iframe>",
  ]) assert.equal(normalizeStreamUrl(u), WATCH, u);
  assert.equal(youTubeId('https://example.com/a.m3u8'), null);
});

test('direct streams pass through; blank clears; junk and non-https are refused', () => {
  assert.equal(normalizeStreamUrl('https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'), 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8');
  assert.equal(normalizeStreamUrl('   '), '');
  assert.equal(normalizeStreamUrl(undefined), '');
  assert.equal(normalizeStreamUrl('http://insecure.example/a.m3u8'), null);
  assert.equal(normalizeStreamUrl('not a url'), null);
  assert.equal(normalizeStreamUrl('<iframe></iframe>'), '');
  assert.equal(normalizeStreamUrl('javascript:alert(1)'), null);
});

test('the temple write hook cleans liveUrl, leaves other bodies alone, and refuses nonsense', () => {
  assert.deepEqual(prepareTemple({ name: 'Kashi' }), { name: 'Kashi' });
  assert.equal(prepareTemple({ name: 'Kashi', liveUrl: IFRAME }).liveUrl, WATCH);
  assert.equal(prepareTemple({ liveUrl: '' }).liveUrl, '');
  assert.throws(() => prepareTemple({ liveUrl: 'rtmp://x' }), (e) => e.status === 400 && e.code === 'bad_stream_url');
});
