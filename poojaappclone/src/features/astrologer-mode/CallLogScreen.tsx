import { ActivityIndicator, FlatList, RefreshControl, StyleSheet } from 'react-native';

import { Button, NoContent, Screen, useScrollPadding } from '@/components/ui';
import { AppBar } from '@/components/ui/surface';
import { useLanguage } from '@/i18n';
import { Space } from '@/theme';

import { CallLogRow } from './components/CallLogRow';
import { useMyCalls } from './hooks/use-my-calls';

/** Full call history, paged. */
export function CallLogScreen() {
  const { t } = useLanguage();
  const pad = useScrollPadding();
  const { calls, loading, error, more, refresh, loadMore } = useMyCalls(20);

  return (
    <Screen>
      <AppBar title={t('am_calls_title')} back={false} />
      <FlatList
        data={calls}
        keyExtractor={(r) => r.id}
        renderItem={({ item }) => <CallLogRow row={item} showDate />}
        refreshControl={<RefreshControl refreshing={false} onRefresh={refresh} />}
        onEndReached={loadMore}
        contentContainerStyle={[styles.list, pad]}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator />
          ) : error ? (
            <>
              <NoContent title={t('am_load_error')} body="" />
              <Button label={t('astro_retry')} variant="outline" onPress={refresh} />
            </>
          ) : (
            <NoContent title={t('am_no_calls_title')} body={t('am_no_calls_body')} />
          )
        }
        ListFooterComponent={
          more ? <Button label={t('am_load_more')} variant="ghost" onPress={loadMore} /> : null
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({ list: { paddingHorizontal: Space.margin } });
