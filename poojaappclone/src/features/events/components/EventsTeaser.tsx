import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Type } from '@/components/ui';
import type { EventCard, EventType } from '@/lib/api';

import { useNow } from '../hooks/use-now';
import { eventHref } from '../lib/routes';
import { ContinueCard, UpcomingRow } from './EventCards';

/**
 * Home's events teaser: a few cards (Continue cards for events the devotee has
 * joined, compact rows for upcoming ones) under a title with a "see all" link.
 * Draws nothing when there are no cards — the caller decides the title and link
 * text, so this carries no copy of its own.
 */
export function EventsTeaser({
  cards,
  types,
  joined,
  title,
  link,
  onLink,
}: {
  cards: EventCard[];
  types: EventType[];
  /** Cards are events the devotee has joined (shows progress). */
  joined: boolean;
  title: string;
  link?: string;
  onLink: () => void;
}) {
  const router = useRouter();
  const now = useNow();
  if (!cards.length) return null;

  return (
    <View style={styles.wrap}>
      {(!!title || !!link) && (
        <View style={styles.head}>
          {!!title && (
            <Type v="titleMd" accessibilityRole="header">
              {title}
            </Type>
          )}
          {!!link && (
            <Pressable accessibilityRole="link" onPress={onLink} hitSlop={10}>
              <Type v="labelMd" tone="primary">
                {link}
              </Type>
            </Pressable>
          )}
        </View>
      )}
      {cards.map((card) =>
        joined ? (
          <ContinueCard key={card.slug} card={card} types={types} now={now} onPress={() => router.push(eventHref(card.slug))} />
        ) : (
          <UpcomingRow key={card.slug} card={card} types={types} now={now} onPress={() => router.push(eventHref(card.slug))} />
        ),
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 2 },
});
