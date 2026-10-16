import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Screen, Type } from '@/components/ui';
import { useLanguage } from '@/i18n';
import { useContent } from '@/providers/content';
import { Space } from '@/theme';

import { RecentList } from './components/RecentList';
import { ResultSection } from './components/ResultSection';
import { SearchHeader } from './components/SearchHeader';
import { SuggestionChips } from './components/SuggestionChips';
import { useRecents } from './hooks/use-recents';
import { useSearch } from './hooks/use-search';
import type { Entry } from './lib/entries';
import { buildSuggestions } from './lib/suggest';

const DEBOUNCE_MS = 250;

/**
 * One search across poojas, chadhava, temples, bhajans, deities, events and festivals.
 *
 * Results follow the text after a 250 ms pause (and at once on submit). A search is remembered
 * only when the devotee submits it or opens a result, never for every keystroke.
 */
export function SearchScreen() {
  const router = useRouter();
  const { t } = useLanguage();
  const params = useLocalSearchParams<{ q?: string }>();
  const initial = typeof params.q === 'string' ? params.q : '';
  const [text, setText] = useState(initial);
  const [query, setQuery] = useState(initial.trim());
  const { recents, add, remove, clear } = useRecents();
  const { deities, temples, aartis } = useContent();

  useEffect(() => {
    const id = setTimeout(() => setQuery(text.trim()), DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [text]);

  const search = useSearch(query);
  const suggestions = useMemo(() => buildSuggestions({ deities, temples, aartis }), [deities, temples, aartis]);

  const run = useCallback(
    (q: string) => {
      setText(q);
      setQuery(q.trim());
      add(q);
    },
    [add],
  );
  const submit = useCallback(() => {
    setQuery(text.trim());
    add(text);
  }, [text, add]);

  const open = useCallback(
    (e: Entry) => {
      add(query || text);
      router.push((e.fresh ? `${e.href}&ts=${Date.now()}` : e.href) as never);
    },
    [add, query, text, router],
  );
  const seeAll = useCallback(
    (href: string) => {
      add(query || text);
      router.push(href as never);
    },
    [add, query, text, router],
  );

  const typing = text.trim().length > 0;

  return (
    <Screen tabBar={false}>
      <SearchHeader
        value={text}
        onChange={setText}
        onSubmit={submit}
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        placeholder={t('sr_placeholder')}
        backLabel={t('sr_back')}
        clearLabel={t('sr_clear')}
      />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}>
        {!typing ? (
          <>
            <RecentList
              items={recents}
              title={t('sr_recent')}
              clearAllLabel={t('sr_clear_all')}
              clearAllA11y={t('sr_clear_all_a11y')}
              removeLabel={t('sr_remove_recent')}
              onPick={run}
              onRemove={remove}
              onClear={clear}
            />
            {suggestions.length > 0 && (
              <View style={styles.block}>
                <Type v="titleMd" accessibilityRole="header">
                  {t('sr_try')}
                </Type>
                <SuggestionChips items={suggestions} onPick={run} />
              </View>
            )}
          </>
        ) : (
          <>
            {search.failed && (
              <Type v="bodySm" tone="onSurfaceVariant" accessibilityLiveRegion="polite">
                {t('sr_offline')}
              </Type>
            )}
            {search.sections.map((s) => (
              <ResultSection
                key={s.kind}
                section={s}
                title={t(s.titleKey)}
                seeAllLabel={t('sr_see_all')}
                seeAllA11y={t('sr_see_all_a11y').replace('{section}', t(s.titleKey))}
                openLabel={t('sr_open')}
                loadingLabel={t('sr_loading')}
                onOpen={open}
                onSeeAll={seeAll}
              />
            ))}
            {search.none && (
              <View style={styles.block} accessibilityLiveRegion="polite">
                <Type v="titleMd" center>
                  {t('sr_none').replace('{q}', query)}
                </Type>
                <Type v="bodySm" tone="onSurfaceVariant" center>
                  {t('sr_none_hint')}
                </Type>
                {suggestions.length > 0 && (
                  <>
                    <Type v="titleMd" accessibilityRole="header">
                      {t('sr_try')}
                    </Type>
                    <SuggestionChips items={suggestions} onPick={run} />
                  </>
                )}
              </View>
            )}
          </>
        )}
        <SafeAreaView edges={['bottom']} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: Space.margin, paddingTop: Space.sm, paddingBottom: Space.xl, gap: Space.lg },
  block: { gap: Space.sm },
});
