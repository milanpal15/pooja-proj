import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Button, Card, Type } from '@/components/ui';
import { useLanguage } from '@/i18n';
import type { WalletTxn } from '@/lib/api';
import { Space, useTheme } from '@/theme';

import { TransactionRow } from './TransactionRow';

const PREVIEW = 5;

type Props = {
  transactions: WalletTxn[];
  status: 'loading' | 'ready' | 'error';
  onRetry: () => void;
};

/** History with all four data states: loading, error, empty, populated. */
export function TransactionList({ transactions, status, onRetry }: Props) {
  const { c } = useTheme();
  const { t } = useLanguage();
  const [all, setAll] = useState(false);
  const shown = all ? transactions : transactions.slice(0, PREVIEW);

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Type v="titleLg">{t('wallet_history')}</Type>
        {transactions.length > PREVIEW && (
          <Button
            variant="ghost"
            size="sm"
            label={all ? t('show_less') : t('see_all')}
            onPress={() => setAll((v) => !v)}
          />
        )}
      </View>

      {status === 'loading' && transactions.length === 0 ? (
        <ActivityIndicator color={c.gold} style={{ margin: Space.lg }} />
      ) : status === 'error' && transactions.length === 0 ? (
        <Card variant="sunken" style={styles.note}>
          <Type v="bodyMd" tone="onSurfaceVariant" center>
            {t('history_error')}
          </Type>
          <Button label={t('retry')} variant="outline" size="sm" onPress={onRetry} style={{ alignSelf: 'center' }} />
        </Card>
      ) : transactions.length === 0 ? (
        <Card variant="sunken">
          <Type v="bodyMd" tone="onSurfaceVariant" center>
            {t('history_empty')}
          </Type>
        </Card>
      ) : (
        <Card padded={false} style={{ paddingHorizontal: 14 }}>
          {shown.map((x, i) => (
            <TransactionRow key={x.id} txn={x} last={i === shown.length - 1} />
          ))}
        </Card>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Space.sm },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  note: { gap: Space.sm },
});
