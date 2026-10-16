import type { Fields } from './match';
import { rank } from './match';

/** One row in a results section, already localised; `fields` is what the matcher looks at. */
export type Entry = {
  key: string;
  title: string;
  subtitle: string;
  href: string;
  /** Append a fresh `ts` when opening (the pooja screen re-reads its params on it, like Home's deity row). */
  fresh?: boolean;
  fields: Fields;
};

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const enc = encodeURIComponent;
const pick = (hi: boolean, en: unknown, hiText: unknown): string => (hi ? str(hiText) || str(en) : str(en) || str(hiText));
const join = (...parts: unknown[]) => parts.map(str).filter(Boolean).join(' · ');
const list = <T>(v: T[] | null | undefined): T[] => (Array.isArray(v) ? v : []);

const EN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const HI_MONTHS = ['जन॰', 'फ़र॰', 'मार्च', 'अप्रैल', 'मई', 'जून', 'जुल॰', 'अग॰', 'सित॰', 'अक्तू॰', 'नव॰', 'दिस॰'];

/** `2026-10-12` -> "12 Oct" / "12 अक्तू॰"; anything unparseable is shown as given. */
export function dayLabel(iso: unknown, hi: boolean): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(str(iso));
  if (!m) return str(iso);
  const month = Number(m[2]) - 1;
  if (month < 0 || month > 11) return str(iso);
  return `${Number(m[3])} ${(hi ? HI_MONTHS : EN_MONTHS)[month]}`;
}

type PoojaLike = { slug: string; title?: string; titleHi?: string; tagline?: string; taglineHi?: string; templeName?: string; place?: string; festivalName?: string; tithi?: string };
export function poojaEntries(cards: PoojaLike[] | null | undefined, hi: boolean): Entry[] {
  return list(cards).map((p) => ({
    key: p.slug,
    title: pick(hi, p.title, p.titleHi),
    subtitle: join(p.templeName, p.place),
    href: `/pooja/${enc(p.slug)}`,
    fields: { primary: [p.title, p.titleHi], secondary: [p.tagline, p.taglineHi, p.templeName, p.place, p.festivalName, p.tithi] },
  }));
}

type ChadhavaLike = { slug: string; title?: string; titleHi?: string; templeName?: string; place?: string; category?: string; summary?: string; summaryHi?: string };
export function chadhavaEntries(rows: ChadhavaLike[] | null | undefined, hi: boolean): Entry[] {
  return list(rows).map((r) => ({
    key: r.slug,
    title: pick(hi, r.title, r.titleHi),
    subtitle: join(r.templeName, r.place),
    href: `/chadhava/${enc(r.slug)}`,
    fields: { primary: [r.title, r.titleHi], secondary: [r.templeName, r.place, r.category, r.summary, r.summaryHi] },
  }));
}

type TempleLike = { slug: string; name?: string; location?: string; deitySlug?: string };
/** There is no temple detail route: a temple opens the Temples tab filtered to its name. */
export function templeEntries(rows: TempleLike[] | null | undefined, deityName: (slug: string) => string): Entry[] {
  return list(rows).map((r) => {
    const deity = r.deitySlug ? deityName(r.deitySlug) : '';
    return {
      key: r.slug,
      title: str(r.name),
      subtitle: join(r.location, deity),
      href: `/temples?search=${enc(str(r.name))}`,
      fields: { primary: [r.name], secondary: [r.location, deity, r.deitySlug] },
    };
  });
}

type AartiLike = { _id: string; title?: string; artist?: string; deitySlug?: string; category?: string };
/** The Bhajan tab has no per-track route, so a track opens the library. */
export function aartiEntries(rows: AartiLike[] | null | undefined, deityName: (slug: string) => string): Entry[] {
  return list(rows).map((r) => {
    const deity = r.deitySlug ? deityName(r.deitySlug) : '';
    return {
      key: r._id,
      title: str(r.title),
      subtitle: join(r.artist, deity),
      href: '/bhajan',
      fields: { primary: [r.title], secondary: [r.artist, deity, r.deitySlug] },
    };
  });
}

type DeityLike = { slug: string; name?: string; title?: string; mantra?: string };
type LoreLike = { deitySlug?: string; epithet?: string; epithetHi?: string; texts?: string[]; textsHi?: string[] };
export function deityEntries(deities: DeityLike[] | null | undefined, lore: LoreLike[] | null | undefined, hi: boolean): Entry[] {
  const byDeity = new Map<string, LoreLike>();
  for (const l of list(lore)) if (l?.deitySlug && !byDeity.has(l.deitySlug)) byDeity.set(l.deitySlug, l);
  return list(deities).map((d) => {
    const l = byDeity.get(d.slug);
    return {
      key: d.slug,
      title: str(d.name),
      subtitle: pick(hi, l?.epithet, l?.epithetHi) || str(d.title),
      href: `/pooja?deity=${enc(d.slug)}`,
      fresh: true,
      fields: {
        primary: [d.name, d.slug],
        secondary: [d.title, d.mantra, l?.epithet, l?.epithetHi, ...list(l?.texts), ...list(l?.textsHi)],
      },
    };
  });
}

type EventLike = { slug: string; title?: string; titleHi?: string; summary?: string; summaryHi?: string; typeName?: string; typeNameHi?: string; tags?: string[]; venueLabel?: string };
export function eventEntries(rows: EventLike[] | null | undefined, hi: boolean, hrefOf: (slug: string) => string): Entry[] {
  const seen = new Set<string>();
  const out: Entry[] = [];
  for (const e of list(rows)) {
    if (!e?.slug || seen.has(e.slug)) continue;
    seen.add(e.slug);
    out.push({
      key: e.slug,
      title: pick(hi, e.title, e.titleHi),
      subtitle: pick(hi, e.typeName, e.typeNameHi),
      href: hrefOf(e.slug),
      fields: { primary: [e.title, e.titleHi], secondary: [e.summary, e.summaryHi, e.typeName, e.typeNameHi, e.venueLabel, ...list(e.tags)] },
    });
  }
  return out;
}

type FestivalLike = { id: string; name?: string; nameHi?: string; date?: string; deity?: string };
export function festivalEntries(rows: FestivalLike[] | null | undefined, deityName: (slug: string) => string, hi: boolean): Entry[] {
  return list(rows).map((f) => {
    const deity = f.deity ? deityName(f.deity) : '';
    return {
      key: f.id,
      title: pick(hi, f.name, f.nameHi),
      subtitle: join(dayLabel(f.date, hi), deity),
      href: '/festivals',
      fields: { primary: [f.name, f.nameHi], secondary: [deity, f.deity] },
    };
  });
}

/**
 * The best `limit` matches plus how many matched in all (for "See all").
 *
 * `extras` are rows a server already chose for this query. They join the pool (de-duplicated by
 * key) and, when our matcher would not have picked them, are kept after the ranked ones, since
 * the server may match more loosely than we do.
 */
export function topEntries(entries: Entry[], query: string, limit = 5, extras: Entry[] = []): { hits: Entry[]; total: number } {
  const seen = new Set<string>();
  const pool = [...entries, ...extras].filter((e) => (seen.has(e.key) ? false : (seen.add(e.key), true)));
  const ranked = rank(pool, query, (e) => e.fields);
  const have = new Set(ranked.map((e) => e.key));
  const all = [...ranked, ...extras.filter((e) => !have.has(e.key) && have.add(e.key))];
  return { hits: all.slice(0, limit), total: all.length };
}
