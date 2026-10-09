import { Ember, Kumkum, Saffron } from '@/theme';

/** Backdrops, drawn from the palette rather than invented per screen. */
export const WASHES: Record<string, readonly [string, string, string]> = {
  sanctum: [Ember[500], Ember[700], Ember[900]],
  dawn: [Saffron[200], Saffron[500], Ember[700]],
  night: [Ember[900], Kumkum[800], '#05070D'],
};
