import { Card, ListRow } from '@/components/ui';

import { Section } from './Section';

const noop = () => {};

export function RowsSection() {
  return (
    <Section title="Rows">
      <Card variant="sunken" padded={false}>
        <ListRow icon="diya" title="My Poojas" subtitle="Upcoming & past bookings" onPress={noop} />
        <ListRow icon="temple" title="Saved Temples" subtitle="Your spiritual destinations" onPress={noop} />
        <ListRow icon="globe" title="Language" subtitle="हिंदी" onPress={noop} last />
      </Card>
    </Section>
  );
}
