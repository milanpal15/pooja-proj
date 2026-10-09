import { Pressable, StyleSheet, View } from 'react-native';

import { Card, Icon, Type } from '@/components/ui';
import { Radius, Space, useTheme } from '@/theme';

import type { FAQItem } from '../types';

export function FaqCard({
  item,
  hi,
  expanded,
  onToggle,
}: {
  item: FAQItem;
  hi: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { c } = useTheme();
  const question = hi ? item.questionHi : item.questionEn;
  const answer = hi ? item.answerHi : item.answerEn;
  const catLabel = hi ? item.categoryTitleHi : item.categoryTitleEn;

  return (
    <Card
      variant={expanded ? 'ornate' : 'plain'}
      style={[styles.faqCard, expanded && { borderColor: c.primary, shadowOpacity: 0.12 }]}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={question}
        style={styles.faqHeader}>
        <View style={{ flex: 1, gap: 4 }}>
          <View style={[styles.catBadge, { backgroundColor: c.accentContainer }]}>
            <Type v="labelSm" tone="primary">
              {catLabel}
            </Type>
          </View>
          <Type v="titleSm" tone={expanded ? 'goldInk' : 'onSurface'}>
            {question}
          </Type>
        </View>
        <View style={[styles.chevronWrap, { backgroundColor: c.containerLow }]}>
          <Icon
            name={expanded ? 'minus' : 'plus'}
            size={18}
            color={expanded ? c.primary : c.onSurfaceVariant}
          />
        </View>
      </Pressable>

      {expanded && (
        <View style={[styles.answerContainer, { borderTopColor: c.outlineVariant }]}>
          <Type v="bodyMd" tone="onSurface" style={styles.answerText}>
            {answer}
          </Type>
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  faqCard: {
    padding: Space.md,
  },
  faqHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.sm,
  },
  catBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.full,
  },
  chevronWrap: {
    width: 28,
    height: 28,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  answerContainer: {
    marginTop: Space.sm,
    paddingTop: Space.sm,
    borderTopWidth: 1,
  },
  answerText: {
    lineHeight: 22,
  },
});
