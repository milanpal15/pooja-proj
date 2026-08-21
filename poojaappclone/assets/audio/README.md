# Audio

Drop sound files here, then reference them in `src/constants/sounds.ts`.

| file          | used for                                                        |
| ------------- | -------------------------------------------------------------- |
| `bell.mp3`    | temple-bell strike — plays on bell tap and during Auto Aarti   |
| `aarti.mp3`   | aarti / bhajan track — loops while music is on or during Auto Aarti |

Then edit `src/constants/sounds.ts`:

```ts
export const SOUNDS = {
  bell: require('@/assets/audio/bell.mp3'),
  aarti: require('@/assets/audio/aarti.mp3'),
};
```

Or use remote URLs: `aarti: { uri: 'https://…/aarti.mp3' }`.
Keep files small (mp3/m4a). You can add just one — the other stays silent.
