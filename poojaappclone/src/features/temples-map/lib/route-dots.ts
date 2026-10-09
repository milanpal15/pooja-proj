import type { Temple } from '@/constants/temples';

/** Evenly spaced dots along the straight line between each consecutive pair of temples. */
export function routeDots(temples: Temple[]) {
  const dots: { x: number; y: number; key: string }[] = [];
  for (let i = 0; i < temples.length - 1; i++) {
    const a = temples[i].map;
    const b = temples[i + 1].map;
    const steps = Math.round(Math.hypot(b.x - a.x, b.y - a.y) / 22);
    for (let s = 1; s < steps; s++) {
      dots.push({
        x: a.x + ((b.x - a.x) * s) / steps,
        y: a.y + ((b.y - a.y) * s) / steps,
        key: `${i}-${s}`,
      });
    }
  }
  return dots;
}
