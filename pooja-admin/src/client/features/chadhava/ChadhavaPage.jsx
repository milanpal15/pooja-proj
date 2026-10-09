import { useState } from 'react';

import { useRefOptions } from '../../lib/hooks/useRefOptions.js';
import { Banner, Button, ErrorState, TableSkeleton, Tabs } from '../../ui/index.js';
import { CategoriesTab } from './components/CategoriesTab.jsx';
import { ListingsTab } from './components/ListingsTab.jsx';
import { OfferingsTab } from './components/OfferingsTab.jsx';
import { useChadhava } from './hooks/useChadhava.js';

const TABS = [
  { id: 'listings', label: 'Listings' },
  { id: 'offerings', label: 'Offerings' },
  { id: 'categories', label: 'Categories' },
];

/**
 * Chadhava: listings group offerings by occasion and temple; offerings are
 * priced in coins. `area` (content) decides whether this account may write.
 */
export function ChadhavaPage({ area }) {
  const [tab, setTab] = useState('listings');
  const refs = useRefOptions();
  const c = useChadhava();
  const categoryName = (slug) => (slug ? c.categories.find((x) => x.slug === slug)?.name || slug : '');

  return (
    <div className="ui-page">
      <p className="content-lede">Listings group offerings by occasion and temple. Offerings are priced in coins; a devotee pays exactly what is listed here.</p>
      <Tabs label="Chadhava" tabs={TABS} value={tab} onChange={setTab} />
      {tab === 'categories' && <CategoriesTab area={area} onChange={c.reload} />}
      {tab !== 'categories' && c.status === 'loading' && <TableSkeleton />}
      {tab !== 'categories' && c.status === 'error' && <ErrorState message={c.error} offline={c.offline} onRetry={c.reload} />}
      {tab !== 'categories' && c.status === 'stale' && (
        <Banner tone="warning" action={<Button variant="outline" size="sm" onClick={c.reload}>Try again</Button>}>
          Showing the last data we got. {c.error}
        </Banner>
      )}
      {tab !== 'categories' && (c.status === 'ready' || c.status === 'stale') && (
        <>
          {tab === 'listings' && <ListingsTab area={area} c={c} refs={refs} categoryName={categoryName} />}
          {tab === 'offerings' && <OfferingsTab area={area} c={c} categoryName={categoryName} />}
        </>
      )}
    </div>
  );
}
