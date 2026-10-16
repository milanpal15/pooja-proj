import { publicGet } from './client';

/**
 * Real nearby Hindu temples from OpenStreetMap, served by our backend (docs/TEMPLE_MAP.md). The phone
 * never calls Overpass itself. Fields OSM lacks arrive as null — never invent one.
 */

export type NearbyTemple = {
  id: string;
  name: string;
  nameHi: string | null;
  lat: number;
  lng: number;
  address: string | null;
  deity: string | null;
  /** Metres from the REQUESTED point. */
  distanceM: number;
};

export type NearbyTemplesResponse = {
  /** Named places only, nearest first, at most 80. */
  temples: NearbyTemple[];
  center: { lat: number; lng: number; radius: number };
  attribution: string;
  source: string;
  cachedAt: string | null;
  stale: boolean;
};

export type NearbyQuery = { lat: number; lng: number; radius: number };

/** `GET /api/places/temples` — public. Radius is clamped server-side to 500..25000 m. */
export function fetchNearbyTemples({ lat, lng, radius }: NearbyQuery): Promise<NearbyTemplesResponse> {
  const q = `lat=${lat.toFixed(5)}&lng=${lng.toFixed(5)}&radius=${Math.round(radius)}`;
  return publicGet<NearbyTemplesResponse>(`/api/places/temples?${q}`, 15_000);
}
