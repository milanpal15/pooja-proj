# Deity images

Drop one image per deity here, then the mandir screen shows the real artwork
instead of the drawn murti (the drawn one stays as an automatic fallback).

## Required filenames (must match the deity id)

| file           | deity        |
| -------------- | ------------ |
| `shiva.png`    | भगवान शिव     |
| `shani.png`    | शनि देव       |
| `vishnu.png`   | भगवान विष्णु  |
| `ganesh.png`   | श्री गणेश     |
| `hanuman.png`  | श्री हनुमान   |
| `durga.png`    | माँ दुर्गा    |
| `lakshmi.png`  | माँ लक्ष्मी   |
| `krishna.png`  | श्री कृष्ण    |

## Specs

- **Transparent PNG** (or WebP), deity cut out — no background box.
- Portrait, roughly **600 × 900 px**, deity centred.
- Keep each under ~300 KB so the bundle stays light.

You don't need all eight — any file present is used; the rest fall back to the
drawn murti.
