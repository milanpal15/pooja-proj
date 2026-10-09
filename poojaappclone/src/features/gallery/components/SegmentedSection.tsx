import { useState } from 'react';

import { Segmented } from '@/components/ui';

import { Section } from './Section';

export function SegmentedSection() {
  return (
    <Section title="Segmented">
      <SegmentedDemo />
    </Section>
  );
}

function SegmentedDemo() {
  const [tab, setTab] = useState<'amount' | 'item'>('amount');
  return (
    <Segmented
      options={[
        { value: 'amount', label: 'Amount' },
        { value: 'item', label: 'Item' },
      ]}
      value={tab}
      onChange={setTab}
    />
  );
}
