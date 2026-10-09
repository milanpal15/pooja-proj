import { useCallback, useEffect, useState } from 'react';

import { fetchPoojaReviews, type PoojaReview } from '@/lib/api';

const PAGE = 20;

/** Newest-first reviews, paged by `before`. Only mounted when the pooja has a rating. */
export function usePoojaReviews(slug: string, enabled: boolean) {
  const [reviews, setReviews] = useState<PoojaReview[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [more, setMore] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    fetchPoojaReviews(slug, { limit: PAGE })
      .then((r) => {
        if (!alive) return;
        setReviews(r);
        setMore(r.length === PAGE);
        setState('ready');
      })
      .catch(() => alive && setState('error'));
    return () => {
      alive = false;
    };
  }, [slug, enabled]);

  const loadMore = useCallback(async () => {
    const last = reviews[reviews.length - 1];
    if (!last) return;
    try {
      const r = await fetchPoojaReviews(slug, { limit: PAGE, before: last.createdAt });
      setReviews((prev) => [...prev, ...r]);
      setMore(r.length === PAGE);
    } catch {
      setState('error');
    }
  }, [slug, reviews]);

  return { reviews, state, more, loadMore };
}
