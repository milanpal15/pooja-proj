/**
 * The Home layout document (docs/HOME_LAYOUT.md §1). One ordered list of
 * blocks; the app has a renderer per block type and a bundled default, and no
 * other layout. These are the shapes AFTER `parseLayout` has made them safe to
 * read: every text is a string, `props` is an object, `data` is valid or null.
 */

/** `{type, ref}` as authored in the dashboard. The server resolves it into `href` on read. */
export type LayoutAction = { type: string; ref?: string } | null;

export type LayoutItem = {
  title: string;
  titleHi: string;
  subtitle: string;
  subtitleHi: string;
  icon: string;
  image: string;
  badge: string;
  liveBadge: boolean;
  flag: string;
  deitySlug: string;
  /** False = "Hidden in this layout": never drawn. Absent in older documents = true. */
  enabled: boolean;
  /** ISO. `badge` is drawn only until this instant; null = no expiry. */
  badgeUntil: string | null;
  action: LayoutAction;
  /** Server-resolved; absent in the bundled default (then `actionHref` derives it). */
  href: string;
};

export type LayoutData =
  | { mode: 'inline'; items: LayoutItem[] }
  | { mode: 'source'; source: string; params: Record<string, unknown>; limit?: number };

export type LayoutBlock = {
  id: string;
  type: string;
  enabled: boolean;
  startsAt: string | null;
  endsAt: string | null;
  language: 'all' | 'en' | 'hi';
  flag: string;
  /** Segment tags, ANY-of; empty = everyone (docs/HOME_LAYOUT.md §9). Unknown tags are kept and never match. */
  audience: string[];
  title: string;
  titleHi: string;
  subtitle: string;
  subtitleHi: string;
  tone: string;
  action: LayoutAction;
  href: string;
  actionLabel: string;
  actionLabelHi: string;
  props: Record<string, unknown>;
  data: LayoutData | null;
};

/** One named layout of the set (§9.1). */
export type Layout = {
  id: string;
  name: string;
  enabled: boolean;
  audience: string[];
  startsAt: string | null;
  endsAt: string | null;
  blocks: LayoutBlock[];
};

/** The document: layouts in priority order, `default` as the fallback. A stored v1 document is wrapped as the default layout. */
export type HomeLayout = {
  schemaVersion: number;
  version?: number;
  layouts: Layout[];
};

/** The device facts audience tags are matched against. */
export type Segment = 'new_user' | 'has_booking' | 'in_event' | 'lapsed';

/** An item ready to draw: language chosen, link resolved. */
export type ViewItem = {
  key: string;
  title: string;
  subtitle: string;
  icon: string;
  image: string;
  badge: string;
  liveBadge: boolean;
  deitySlug: string;
  href: string;
  flag: string;
};
