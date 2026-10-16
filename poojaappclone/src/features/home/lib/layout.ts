/**
 * Pure Home-layout logic (docs/HOME_LAYOUT.md §6): parse a document defensively,
 * filter its blocks for this device and moment, localise texts, resolve links.
 * No React, no `@/` imports — tested with `node --test` (layout.test.mjs).
 */
import type { HomeLayout, LayoutAction, LayoutBlock, LayoutData, LayoutItem, ViewItem } from './layout-types';
import { metaFor } from './block-meta';
import { pick } from './pick';
import { inWindow } from './schedule';

export const SCHEMA_VERSION = 1;
const MAX_BLOCKS = 60;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const isoOrNull = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);

function parseAction(v: unknown): LayoutAction {
  if (!isObj(v) || typeof v.type !== 'string') return null;
  return { type: v.type, ref: str(v.ref) };
}

function parseItem(v: unknown): LayoutItem | null {
  if (!isObj(v)) return null;
  return {
    title: str(v.title),
    titleHi: str(v.titleHi),
    subtitle: str(v.subtitle),
    subtitleHi: str(v.subtitleHi),
    icon: str(v.icon),
    image: str(v.image),
    badge: str(v.badge),
    liveBadge: v.liveBadge === true,
    flag: str(v.flag),
    deitySlug: str(v.deitySlug),
    action: parseAction(v.action),
    href: str(v.href),
  };
}

function parseData(v: unknown): LayoutData | null {
  if (!isObj(v)) return null;
  if (v.mode === 'inline' && Array.isArray(v.items)) {
    return { mode: 'inline', items: v.items.map(parseItem).filter((i): i is LayoutItem => !!i) };
  }
  if (v.mode === 'source' && typeof v.source === 'string' && v.source) {
    const limit = typeof v.limit === 'number' && Number.isFinite(v.limit) && v.limit > 0 ? Math.floor(v.limit) : undefined;
    return { mode: 'source', source: v.source, params: isObj(v.params) ? v.params : {}, limit };
  }
  return null;
}

function parseBlock(v: unknown): LayoutBlock | null {
  if (!isObj(v) || typeof v.id !== 'string' || !v.id || typeof v.type !== 'string' || !v.type) return null;
  const language = v.language === 'en' || v.language === 'hi' ? v.language : 'all';
  return {
    id: v.id,
    type: v.type,
    enabled: v.enabled !== false,
    startsAt: isoOrNull(v.startsAt),
    endsAt: isoOrNull(v.endsAt),
    language,
    flag: str(v.flag),
    title: str(v.title),
    titleHi: str(v.titleHi),
    subtitle: str(v.subtitle),
    subtitleHi: str(v.subtitleHi),
    tone: str(v.tone),
    action: parseAction(v.action),
    href: str(v.href),
    actionLabel: str(v.actionLabel),
    actionLabelHi: str(v.actionLabelHi),
    props: isObj(v.props) ? v.props : {},
    data: parseData(v.data),
  };
}

/**
 * A served / cached / bundled document -> a layout the renderer can trust, or
 * null when it is not one (wrong schema version, no blocks array). Blocks that
 * are malformed or repeat an id are dropped; unknown TYPES are kept here and
 * skipped by `visibleBlocks`, so a newer server never breaks an older app.
 */
export function parseLayout(raw: unknown): HomeLayout | null {
  if (!isObj(raw) || raw.schemaVersion !== SCHEMA_VERSION || !Array.isArray(raw.blocks)) return null;
  const seen = new Set<string>();
  const blocks: LayoutBlock[] = [];
  for (const b of raw.blocks) {
    const block = parseBlock(b);
    if (!block || seen.has(block.id)) continue;
    seen.add(block.id);
    blocks.push(block);
    if (blocks.length >= MAX_BLOCKS) break;
  }
  return { schemaVersion: SCHEMA_VERSION, version: typeof raw.version === 'number' ? raw.version : undefined, blocks };
}

/** `1.2.10` vs `1.2.9`: negative, 0, positive. Non-numeric parts count as 0. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length, 3); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

export type FilterContext = {
  now: number;
  lang: 'en' | 'hi';
  /** Feature flags; a key that is absent is UNKNOWN and never hides anything. */
  flags: Record<string, boolean>;
  appVersion: string;
};

/** Hidden only when the flag is KNOWN to be off — offline (flags unloaded) shows everything. */
export function flagOn(flag: string | undefined, flags: Record<string, boolean>): boolean {
  return !flag || flags[flag] !== false;
}

/**
 * The blocks to draw now, in document order: enabled, inside their window,
 * addressed to this language, not behind a switched-off flag, of a type this
 * app knows and is new enough for.
 */
export function visibleBlocks(blocks: LayoutBlock[], ctx: FilterContext): LayoutBlock[] {
  return blocks.filter((b) => {
    if (!b.enabled) return false;
    const meta = metaFor(b.type);
    if (!meta || compareVersions(ctx.appVersion, meta.minAppVersion) < 0) return false;
    if (b.language !== 'all' && b.language !== ctx.lang) return false;
    if (!inWindow(b.startsAt, b.endsAt, ctx.now)) return false;
    return flagOn(b.flag, ctx.flags);
  });
}

/* ───────────────────────────────────────────────────────────── texts ── */

type TextField = 'title' | 'subtitle' | 'actionLabel';

/** A block text in the reading language (Hindi only when written), trimmed. */
export function blockText(block: LayoutBlock, field: TextField, hi: boolean): string {
  return pick(hi, block[field], block[`${field}Hi` as 'titleHi']).trim();
}

/** `props.<name>` / `props.<name>Hi` as a localised string; '' when unset. */
export function propText(block: LayoutBlock, name: string, hi: boolean): string {
  return pick(hi, str(block.props[name]), str(block.props[`${name}Hi`])).trim();
}

export function propNum(block: LayoutBlock, name: string, fallback: number, min = -Infinity, max = Infinity): number {
  const v = block.props[name];
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
}

export function propStr(block: LayoutBlock, name: string): string {
  return str(block.props[name]);
}

/* ───────────────────────────────────────────────────────────── links ── */

const enc = encodeURIComponent;

/**
 * Where an action goes. The server already resolves `href` on every action it
 * serves, and that wins; the table below is the same mapping (contract §1) for
 * the bundled default, which carries `action` only. The result still goes
 * through `resolveHref` when opened, so a bad ref can never launch anything.
 */
export function actionHref(action: LayoutAction | undefined, href?: string): string {
  const given = (href ?? '').trim();
  if (given) return given;
  if (!action) return '';
  const ref = (action.ref ?? '').trim();
  switch (action.type) {
    case 'pooja':
      return ref ? `/pooja/${enc(ref)}` : '/poojas';
    case 'chadhava':
      return ref ? `/chadhava/${enc(ref)}` : '/chadhava';
    case 'temple':
      return ref ? `/poojas?temple=${enc(ref)}` : '/temples';
    case 'bhajan':
      return '/bhajan';
    case 'astrologer':
      return '/astrologers';
    case 'coins':
      return '/wallet';
    case 'event':
      return ref ? `/events/${enc(ref)}` : '/events';
    case 'events':
      return '/events';
    case 'live':
      return ref ? `/darshan/${enc(ref)}` : '/darshan';
    case 'panchang':
      return '/panchang';
    case 'horoscope':
      return '/horoscope';
    case 'route':
      return ref.startsWith('/') && !ref.startsWith('//') ? ref : '';
    case 'link':
      return /^https:\/\//i.test(ref) ? ref : '';
    default:
      return '';
  }
}

export const blockHref = (block: LayoutBlock): string => actionHref(block.action, block.href);

/* ───────────────────────────────────────────────────────────── items ── */

/** One inline item, drawn: Hindi where written, link resolved. Null when there is nothing to draw. */
export function viewItem(item: LayoutItem, hi: boolean, key: string): ViewItem | null {
  const title = pick(hi, item.title, item.titleHi).trim();
  if (!title && !item.image && !item.deitySlug) return null;
  return {
    key,
    title,
    subtitle: pick(hi, item.subtitle, item.subtitleHi).trim(),
    icon: item.icon,
    image: item.image,
    badge: item.badge,
    liveBadge: item.liveBadge,
    deitySlug: item.deitySlug,
    href: actionHref(item.action, item.href),
    flag: item.flag,
  };
}

/** An inline block's items: flag-hidden ones removed, capped at `limit`. */
export function inlineItems(block: LayoutBlock, flags: Record<string, boolean>, hi: boolean): ViewItem[] {
  if (block.data?.mode !== 'inline') return [];
  const out: ViewItem[] = [];
  block.data.items.forEach((it, i) => {
    if (!flagOn(it.flag, flags)) return;
    const v = viewItem(it, hi, `${block.id}:${i}`);
    if (v) out.push(v);
  });
  return out;
}

/** The source a block is bound to, if it is bound to one of `allowed` (else its type's default). */
export function sourceOf<S extends string>(block: LayoutBlock, allowed: readonly S[]): S {
  if (block.data?.mode === 'source' && (allowed as readonly string[]).includes(block.data.source)) return block.data.source as S;
  return allowed[0];
}

export function sourceParams(block: LayoutBlock): Record<string, unknown> {
  return block.data?.mode === 'source' ? block.data.params : {};
}

export function sourceLimit(block: LayoutBlock): number | undefined {
  return block.data?.mode === 'source' ? block.data.limit : undefined;
}

/** A string-array / string param ("tags": ["a"]) as a list. */
export function paramList(params: Record<string, unknown>, name: string): string[] {
  const v = params[name];
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string' && !!x);
  return typeof v === 'string' && v ? [v] : [];
}
