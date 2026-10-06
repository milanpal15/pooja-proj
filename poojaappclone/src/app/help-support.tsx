import { useMemo, useState } from 'react';
import {
  FlatList,
  Linking,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';

import { Button, Card, Chip, Field, Icon, Screen, Type, useScrollPadding, useToast } from '@/components/ui';
import { AppBar } from '@/components/ui/surface';
import { FAQS, FAQItem } from '@/constants/faqs';
import {
  SUPPORT_EMAIL,
  SUPPORT_HOURS_EN,
  SUPPORT_HOURS_HI,
  SUPPORT_PHONE,
} from '@/constants/support';
import { useContent } from '@/context/content';
import { useLanguage } from '@/context/language';
import { Radius, Space, useTheme } from '@/theme';

type FAQCategory = 'all' | 'booking' | 'prasad' | 'chadhava' | 'virtual' | 'account';

export default function HelpSupportScreen() {
  const { c } = useTheme();
  const { t, lang } = useLanguage();
  const toast = useToast();
  const { demo, faqs: remoteFaqs, settingText } = useContent();

  /*
   * Dashboard first, then the env fallback from `constants/support.ts`.
   * Both empty means the channel is hidden rather than dialling a
   * placeholder — the app used to ship `support@shrimandir.devotee`, a TLD
   * that does not exist, and a vanity number somebody else may own.
   */
  const supportEmail = settingText('supportEmail') || SUPPORT_EMAIL;
  const supportPhone = settingText('supportPhone') || SUPPORT_PHONE;
  const supportHours =
    (lang === 'hi'
      ? settingText('supportHoursHi') || SUPPORT_HOURS_HI
      : settingText('supportHours') || SUPPORT_HOURS_EN) || '';
  const hasSupport = !!(supportEmail || supportPhone);

  /** Admin-managed FAQs, falling back to the bundled set when offline. */
  const allFaqs: FAQItem[] = useMemo(
    () =>
      remoteFaqs.length
        ? remoteFaqs.map((f) => ({
            id: f.slug,
            category: f.category as FAQItem['category'],
            categoryTitleEn: f.categoryTitle ?? '',
            categoryTitleHi: f.categoryTitleHi ?? '',
            questionEn: f.question,
            questionHi: f.questionHi ?? f.question,
            answerEn: f.answer,
            answerHi: f.answerHi ?? f.answer,
          }))
        : demo
          ? FAQS
          : [],
    [remoteFaqs, demo],
  );
  const scrollPad = useScrollPadding();

  const [query, setQuery] = useState('');
  const [selectedCat, setSelectedCat] = useState<FAQCategory>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const categories: { key: FAQCategory; label: string }[] = useMemo(
    () => [
      { key: 'all', label: t('filter_all') },
      { key: 'booking', label: lang === 'hi' ? 'पूजा बुकिंग' : 'Pooja' },
      { key: 'prasad', label: lang === 'hi' ? 'प्रसाद डिलीवरी' : 'Prasad' },
      { key: 'chadhava', label: lang === 'hi' ? 'ई-चढ़ावा' : 'Chadhava' },
      { key: 'virtual', label: lang === 'hi' ? 'वर्चुअल आरती' : 'Virtual' },
      { key: 'account', label: lang === 'hi' ? 'सहायता' : 'Support' },
    ],
    [lang, t]
  );

  const filteredFaqs = useMemo(() => {
    return allFaqs.filter((item) => {
      const matchesCat = selectedCat === 'all' || item.category === selectedCat;
      if (!matchesCat) return false;

      if (!query.trim()) return true;
      const q = query.trim().toLowerCase();
      const qEn = item.questionEn.toLowerCase();
      const qHi = item.questionHi.toLowerCase();
      const aEn = item.answerEn.toLowerCase();
      const aHi = item.answerHi.toLowerCase();
      return qEn.includes(q) || qHi.includes(q) || aEn.includes(q) || aHi.includes(q);
    });
  }, [allFaqs, selectedCat, query]);

  const toggleExpand = (id: string) => {
    setExpandedId((curr) => (curr === id ? null : id));
  };

  const handleCallSupport = () => {
    Linking.openURL(`tel:${supportPhone}`).catch(() => {
      // No dialler on this device — show the number so it can be copied.
      toast.error(t('contact_support'), { description: supportPhone });
    });
  };

  const handleEmailSupport = () => {
    Linking.openURL(
      `mailto:${supportEmail}?subject=Devotee%20Support%20Request`,
    ).catch(() => {
      toast.error(t('contact_support'), { description: supportEmail });
    });
  };

  const renderHeader = () => (
    <View style={styles.headerContainer}>
      {/* Devotee Support Hero Card */}
      <Card variant="ornate" style={styles.helplineCard}>
        <View style={styles.helplineTop}>
          <View style={[styles.iconMedallion, { backgroundColor: c.accentContainer }]}>
            <Icon name="bell" size={24} color={c.primary} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Type v="titleMd" tone="goldInk">
              {t('contact_support')}
            </Type>
            <Type v="bodySm" tone="onSurfaceVariant">
              {supportHours ||
                (lang === 'hi' ? 'भक्त सहायता' : 'Devotee support')}
            </Type>
          </View>
        </View>

        {/* A channel is offered only when it is configured. An unset one is
            hidden rather than dialling a placeholder somebody else owns. */}
        {hasSupport ? (
          <View style={styles.helplineActions}>
            {!!supportPhone && (
              <Button
                label={lang === 'hi' ? 'कॉल करें' : 'Call Helpline'}
                icon="sparkle"
                size="sm"
                style={{ flex: 1 }}
                onPress={handleCallSupport}
              />
            )}
            {!!supportEmail && (
              <Button
                label={lang === 'hi' ? 'ईमेल भेजें' : 'Send Email'}
                variant={supportPhone ? 'outline' : 'primary'}
                size="sm"
                style={{ flex: 1 }}
                onPress={handleEmailSupport}
              />
            )}
          </View>
        ) : (
          <Type v="bodySm" tone="onSurfaceVariant">
            {lang === 'hi'
              ? 'संपर्क विवरण शीघ्र उपलब्ध होंगे। तब तक नीचे दिए सामान्य प्रश्न देखें।'
              : 'Contact details are not published yet — the FAQs below cover the common questions.'}
          </Type>
        )}
      </Card>

      {/* Search Input */}
      <View style={styles.searchWrap}>
        <Field
          placeholder={t('search_faqs')}
          value={query}
          onChangeText={setQuery}
          icon="search"
        />
      </View>

      {/* Category Chips */}
      <View style={styles.chipsRow}>
        {categories.map((cat) => (
          <Chip
            key={cat.key}
            label={cat.label}
            selected={selectedCat === cat.key}
            onPress={() => setSelectedCat(cat.key)}
          />
        ))}
      </View>
    </View>
  );

  const renderFaqItem = ({ item }: { item: FAQItem }) => {
    const isExpanded = expandedId === item.id;
    const question = lang === 'hi' ? item.questionHi : item.questionEn;
    const answer = lang === 'hi' ? item.answerHi : item.answerEn;
    const catLabel = lang === 'hi' ? item.categoryTitleHi : item.categoryTitleEn;

    return (
      <Card
        variant={isExpanded ? 'ornate' : 'plain'}
        style={[
          styles.faqCard,
          isExpanded && { borderColor: c.primary, shadowOpacity: 0.12 },
        ]}>
        <Pressable
          onPress={() => toggleExpand(item.id)}
          accessibilityRole="button"
          accessibilityLabel={question}
          style={styles.faqHeader}>
          <View style={{ flex: 1, gap: 4 }}>
            <View style={[styles.catBadge, { backgroundColor: c.accentContainer }]}>
              <Type v="labelSm" tone="primary">
                {catLabel}
              </Type>
            </View>
            <Type v="titleSm" tone={isExpanded ? 'goldInk' : 'onSurface'}>
              {question}
            </Type>
          </View>
          <View style={[styles.chevronWrap, { backgroundColor: c.containerLow }]}>
            <Icon
              name={isExpanded ? 'minus' : 'plus'}
              size={18}
              color={isExpanded ? c.primary : c.onSurfaceVariant}
            />
          </View>
        </Pressable>

        {isExpanded && (
          <View style={[styles.answerContainer, { borderTopColor: c.outlineVariant }]}>
            <Type v="bodyMd" tone="onSurface" style={styles.answerText}>
              {answer}
            </Type>
          </View>
        )}
      </Card>
    );
  };

  return (
    <Screen tabBar={false} watermark>
      <AppBar title={t('faqs_title')} />

      <FlatList
        data={filteredFaqs}
        keyExtractor={(item) => item.id}
        renderItem={renderFaqItem}
        ListHeaderComponent={renderHeader}
        contentContainerStyle={[styles.listContainer, scrollPad]}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Icon name="search" size={40} color={c.onSurfaceFaint} />
            <Type v="titleMd" tone="onSurfaceVariant" center>
              {lang === 'hi' ? 'कोई प्रश्न नहीं मिला' : 'No matching questions'}
            </Type>
            <Type v="bodySm" tone="onSurfaceFaint" center>
              {lang === 'hi'
                ? 'कृपया दूसरा शब्द खोजें या सहायता टीम से संपर्क करें।'
                : 'Try searching with different keywords or contact our helpline.'}
            </Type>
          </View>
        }
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
  helplineCard: {
    padding: Space.md,
    gap: Space.md,
  },
  helplineTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
  },
  iconMedallion: {
    width: 44,
    height: 44,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  helplineActions: {
    flexDirection: 'row',
    gap: Space.sm,
  },
  searchWrap: {
    marginTop: 2,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.xs,
  },
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
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Space.xxl,
    gap: Space.sm,
  },
});
