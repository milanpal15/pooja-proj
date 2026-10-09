import { StatCard, StatGrid } from '../../../ui/index.js';

/** Who can take a call right now, and how far onboarding has got. */
export function LiveStrip({ counts, loading }) {
  return (
    <StatGrid aria-label="Astrologers right now">
      <StatCard label="Online now" tone="success" value={counts.online} loading={loading} />
      <StatCard label="On a call" tone="warning" value={counts.busy} loading={loading} />
      <StatCard label="Signed in & active" tone="primary" value={counts.active} suffix={`of ${counts.total}`} loading={loading} />
      <StatCard label="Invited, not signed in yet" value={counts.invited} loading={loading} />
    </StatGrid>
  );
}
