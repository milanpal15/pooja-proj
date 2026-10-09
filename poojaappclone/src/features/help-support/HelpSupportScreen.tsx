import { FlatList, StyleSheet, View } from 'react-native';

import { Screen, useScrollPadding } from '@/components/ui';
import { AppBar } from '@/components/ui/surface';
import { useLanguage } from '@/i18n';
import { Space } from '@/theme';

import { EmptyFaqs } from './components/EmptyFaqs';
import { FaqCard } from './components/FaqCard';
import { FaqFilters } from './components/FaqFilters';
import { SupportCard } from './components/SupportCard';
import { useFaqs } from './hooks/use-faqs';
import { useSupportContact } from './hooks/use-support-contact';
import type { FAQItem } from './types';

export function HelpSupportScreen() {
  const { t, lang } = useLanguage();
  const hi = lang === 'hi';
  const scrollPad = useScrollPadding();
  const support = useSupportContact();
  const faqs = useFaqs();

  // An element, not `() => <…/>`: a function here is a NEW component type on every
  // render, so the search field remounted (and lost focus) on each keystroke.
  const header = (
    <View style={styles.headerContainer}>
      <SupportCard
        hi={hi}
        title={t('contact_support')}
        hours={support.supportHours}
        phone={support.supportPhone}
        email={support.supportEmail}
        hasSupport={support.hasSupport}
        onCall={support.handleCallSupport}
        onEmail={support.handleEmailSupport}
      />
      <FaqFilters
        placeholder={t('search_faqs')}
        query={faqs.query}
        onQuery={faqs.setQuery}
        categories={faqs.categories}
        selected={faqs.selectedCat}
        onSelect={faqs.setSelectedCat}
      />
    </View>
  );

  const renderFaqItem = ({ item }: { item: FAQItem }) => (
    <FaqCard
      item={item}
      hi={hi}
      expanded={faqs.expandedId === item.id}
      onToggle={() => faqs.toggleExpand(item.id)}
    />
  );

  return (
    <Screen tabBar={false} watermark>
      <AppBar title={t('faqs_title')} />

      <FlatList
        data={faqs.filteredFaqs}
        keyExtractor={(item) => item.id}
        renderItem={renderFaqItem}
        ListHeaderComponent={header}
        contentContainerStyle={[styles.listContainer, scrollPad]}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={<EmptyFaqs hi={hi} />}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  listContainer: {
    paddingHorizontal: Space.margin,
    paddingTop: Space.sm,
    paddingBottom: Space.xl,
    gap: Space.md,
  },
  headerContainer: {
    gap: Space.md,
    marginBottom: Space.xs,
  },
});
