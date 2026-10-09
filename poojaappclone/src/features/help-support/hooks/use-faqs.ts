import { useMemo, useState } from 'react';

import { useContent } from '@/providers/content';
import { useLanguage } from '@/i18n';

import type { FAQCategory, FAQItem } from '../types';

/** The FAQ list with its search, category filter and one-open-at-a-time expansion. */
export function useFaqs() {
  const { t, lang } = useLanguage();
  const { faqs: remoteFaqs } = useContent();

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
        : [],
    [remoteFaqs],
  );

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

  return {
    query,
    setQuery,
    selectedCat,
    setSelectedCat,
    expandedId,
    toggleExpand,
    categories,
    filteredFaqs,
  };
}
