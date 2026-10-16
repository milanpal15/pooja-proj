import { ApiError, authedFetch, post, publicFetch } from './client';

/**
 * Contract: docs/EVENTS.md §5.1. Everything the server cannot know arrives as null — never invent a
 * number. Fields the app does not understand are ignored; blocks and task kinds are open strings
 * (§0.8), so an unknown one must degrade instead of breaking (see features/events/lib).
 */

export type EventStatus = 'draft' | 'scheduled' | 'registration_open' | 'live' | 'ended' | (string & {});

export type EventType = { slug: string; name: string; nameHi?: string; color?: string };

export type EventTheme = { color?: string; gradient?: [string, string] | string[] };

export type EventProgress = { done: number; total: number };

export type EventCard = {
  slug: string;
  title: string;
  titleHi?: string;
  summary?: string;
  summaryHi?: string;
  typeSlug: string;
  typeName?: string;
  typeNameHi?: string;
  color?: string;
  gradient?: string[];
  theme?: EventTheme;
  cover?: string;
  tags?: string[];
  status: EventStatus;
  full?: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
  /** Only when real. */
  registered: number | null;
  /** Only when a capacity is set. */
  spotsLeft: number | null;
  milestoneCount: number;
  rewardLabel?: string;
  /** Present once the caller has joined. */
  progress?: EventProgress;
  /** Where the venue is, for the card's sub-line (optional). */
  venueLabel?: string;
  /** `/api/me/events` "me-lite". */
  me?: { currentMilestoneKey?: string | null; passCode?: string | null } | null;
};

export type EventsList = {
  types: EventType[];
  tags: string[];
  sections: {
    continue: EventCard[];
    thisWeek: EventCard[];
    upcoming: EventCard[];
    mine: EventCard[];
    completed: { count: number; titles: string[] };
  };
  badgesCount: number;
};

export type EventTask = {
  key: string;
  kind: string;
  title: string;
  titleHi?: string;
  config?: Record<string, unknown>;
  /** The caller's state for this task (e.g. `{count}`), when joined. */
  state?: Record<string, unknown> | null;
  done?: boolean;
  completedAt?: string | null;
};

export type EventMilestone = {
  key: string;
  title: string;
  titleHi?: string;
  summary?: string;
  opensAt?: string | null;
  coins?: number;
  locked?: boolean;
  done?: boolean;
  completedAt?: string | null;
  tasks?: EventTask[];
};

export type EventReward = {
  kind: string;
  coins?: number;
  badgeSlug?: string;
  badgeName?: string;
  trigger?: { on?: string; milestoneKey?: string };
};

export type RegistrationField = {
  key: string;
  label: string;
  labelHi?: string;
  type: 'text' | 'choice' | 'number' | (string & {});
  required?: boolean;
  options?: string[];
};

export type EventMe = {
  registered?: boolean;
  passCode?: string | null;
  answers?: Record<string, unknown>;
  progress?: EventProgress;
  currentMilestoneKey?: string | null;
  completed?: boolean;
};

export type EventDetail = EventCard & {
  schemaVersion?: number;
  language?: string;
  /** Present AND ordered: the detail screen renders exactly these, in this order. */
  blocks: string[];
  schedule?: { mode?: 'single' | 'multiday' | 'always' | (string & {}); startsAt?: string | null; endsAt?: string | null };
  registration?: {
    mode?: 'none' | 'free' | 'coins' | (string & {});
    coins?: number;
    capacity?: number | null;
    opensAt?: string | null;
    closesAt?: string | null;
    pass?: boolean;
    fields?: RegistrationField[];
  };
  venue?: { name?: string; city?: string; address?: string; lat?: number | null; lng?: number | null; organiser?: string; onlineUrl?: string };
  milestones?: { order?: string; items?: EventMilestone[] };
  rewards?: EventReward[];
  content?: {
    body?: string;
    bodyHi?: string;
    gallery?: string[];
    faq?: { q: string; a: string; qHi?: string; aHi?: string }[];
    links?: { label: string; route: string }[];
  };
  me?: EventMe | null;
};

/** Auth is optional for the list: a signed-in devotee gets Continue/My events, a guest does not. */
async function getEvents<T>(path: string): Promise<T> {
  try {
    return (await authedFetch(path)) as T;
  } catch (e) {
    // No token (or one the server refused): the public view is still worth showing.
    if (e instanceof ApiError && e.status === 401) return publicFetch<T>(path);
    throw e;
  }
}

/** Rejects when the API is unreachable — the hook falls back to its cache. */
export async function fetchEvents(): Promise<EventsList> {
  const res = await getEvents<Partial<EventsList>>('/api/events');
  const s = res.sections ?? ({} as Partial<EventsList['sections']>);
  return {
    types: res.types ?? [],
    tags: res.tags ?? [],
    sections: {
      continue: s.continue ?? [],
      thisWeek: s.thisWeek ?? [],
      upcoming: s.upcoming ?? [],
      mine: s.mine ?? [],
      completed: s.completed ?? { count: 0, titles: [] },
    },
    badgesCount: res.badgesCount ?? 0,
  };
}

export async function fetchEvent(slug: string): Promise<EventDetail> {
  const { event } = await getEvents<{ event: EventDetail }>(`/api/events/${encodeURIComponent(slug)}`);
  return { ...event, blocks: Array.isArray(event.blocks) ? event.blocks : [] };
}

/* ───────────────────────────────────────────────── phase 2: join / progress ── */

export type JoinResult = {
  registration: { status: string; passCode?: string | null; joinedAt?: string; answers?: Record<string, unknown> };
  me: EventMe | null;
};

/** `requestId` makes a retry after a dropped connection land once. Errors: see `lib/registration.ts`. */
export async function joinEvent(slug: string, requestId: string, answers?: Record<string, unknown>): Promise<JoinResult> {
  return (await post(`/api/events/${encodeURIComponent(slug)}/join`, { requestId, ...(answers ? { answers } : {}) })) as JoinResult;
}

export async function leaveEvent(slug: string): Promise<void> {
  await post(`/api/events/${encodeURIComponent(slug)}/leave`);
}

export type CompletionBadge = { slug: string; name: string; nameHi?: string };

export type CompletionSheet = {
  title: string;
  titleHi?: string;
  coins: number;
  progress: EventProgress;
  how: { text: string; textHi?: string }[];
  next: { title: string; titleHi?: string; opensAt?: string | null } | null;
  eventCompleted?: boolean;
  badges?: CompletionBadge[];
};

export type ProgressResponse = {
  task: { key: string; done?: boolean; completedAt?: string | null; state?: Record<string, unknown> | null };
  milestone: { key: string; done?: boolean; justCompleted?: boolean };
  event: { done?: boolean; justCompleted?: boolean };
  awarded: { coins: number; badges?: CompletionBadge[] };
  completion: CompletionSheet | null;
  me?: EventMe | null;
};

/** `{}` for self_mark, `{add}` / `{set}` for counter. A 429 `too_fast` rejects with its body — see `lib/counter-queue.ts`. */
export async function postProgress(slug: string, milestoneKey: string, taskKey: string, report: Record<string, unknown>): Promise<ProgressResponse> {
  const path = `/api/events/${encodeURIComponent(slug)}/milestones/${encodeURIComponent(milestoneKey)}/tasks/${encodeURIComponent(taskKey)}/progress`;
  return (await post(path, report)) as ProgressResponse;
}

export async function fetchMyEvents(): Promise<EventCard[]> {
  const res = (await authedFetch('/api/me/events')) as { events?: EventCard[] };
  return Array.isArray(res.events) ? res.events : [];
}

export type MyBadge = {
  slug: string;
  name: string;
  nameHi?: string;
  art?: string | null;
  description?: string;
  eventSlug: string;
  eventTitle?: string;
  earnedAt?: string | null;
};

export async function fetchMyBadges(): Promise<MyBadge[]> {
  const res = (await authedFetch('/api/me/badges')) as { badges?: MyBadge[] };
  return Array.isArray(res.badges) ? res.badges : [];
}
