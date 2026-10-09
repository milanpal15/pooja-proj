import { useState } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';

import { Button, ProgressBar, Sheet, Type } from '@/components/ui';
import { useAdmin } from '@/providers/admin';
import { useLanguage } from '@/i18n';
import { fill, formatCoins } from '@/lib/format';
import { useWallet } from '@/providers/wallet';
import { Space } from '@/theme';

import { useCoinPacks } from '../hooks/use-coin-packs';
import { useRecharge } from '../hooks/use-recharge';
import { suggestPacks } from '../lib/packs';
import { PackGrid } from './PackGrid';
import { PayButton } from './PayButton';
import { ShortfallPicks } from './ShortfallPicks';
import { TestModeBanner } from './TestModeBanner';

export type AddCoinsSheetProps = {
  visible: boolean;
  onClose: () => void;
  /** Coins missing for whatever the devotee was doing. Highlights the right packs. */
  shortfall?: number;
  /** Fired after coins were credited, before the sheet closes — resume the interrupted action here. */
  onPurchased?: () => void;
  /** Overrides for callers that know what is being bought ("Add coins to book Rudrabhishek"). */
  title?: string;
  subtitle?: string;
};

/** One "not enough coins" sheet for booking, chadhava and calls, so they look and behave alike. */
export function AddCoinsSheet({ visible, onClose, shortfall, title, ...rest }: AddCoinsSheetProps) {
  const { t } = useLanguage();
  const heading = title ?? (shortfall ? t('insufficient_title') : t('add_coins'));
  return (
    <Sheet visible={visible} onClose={onClose} title={heading}>
      {/* Mounted only while open (a Modal renders no children when hidden),
          so the pack choice resets every time the sheet is opened. */}
      <SheetBody shortfall={shortfall} onClose={onClose} {...rest} />
    </Sheet>
  );
}

function SheetBody({
  shortfall,
  onClose,
  onPurchased,
  subtitle,
}: Omit<AddCoinsSheetProps, 'visible' | 'title'>) {
  const { t } = useLanguage();
  const { flags } = useAdmin();
  const { balance } = useWallet();
  const { packs, status, reload } = useCoinPacks();
  const { buy, busy, testMode, error } = useRecharge();
  const [picked, setPicked] = useState<string>();
  const [showAll, setShowAll] = useState(false);

  const have = balance ?? 0;
  const need = have + (shortfall ?? 0);
  const { justEnough, best } = shortfall ? suggestPacks(packs, shortfall) : {};
  const selectedId = picked ?? justEnough?.id ?? packs[0]?.id;
  const selected = packs.find((p) => p.id === selectedId);
  const picksMode = !!shortfall && !showAll && !!(justEnough || best);

  const pay = async () => {
    if (!selected) return;
    if (await buy(selected)) {
      onPurchased?.();
      onClose();
    }
  };

  if (status === 'loading') return <ActivityIndicator style={{ margin: Space.xl }} />;
  if (status === 'error' || packs.length === 0) {
    return (
      <>
        <Type v="bodyMd" tone="onSurfaceVariant" center>
          {status === 'error' ? t('packs_error') : t('packs_empty')}
        </Type>
        <Button label={t('retry')} variant="outline" block onPress={reload} />
      </>
    );
  }

  return (
    <>
      <Type v="bodyMd" tone="onSurfaceVariant">
        {subtitle ??
          (shortfall
            ? fill(t('insufficient_msg'), {
                balance: formatCoins(have),
                needed: formatCoins(need),
                shortfall: formatCoins(shortfall),
              })
            : t('coin_rate_note'))}
      </Type>

      {!!shortfall && (
        <>
          <ProgressBar value={have} max={need} tone="danger" />
          <Type v="labelMd" tone="error">
            {fill(t('coins_short'), { n: formatCoins(shortfall) })}
          </Type>
        </>
      )}

      {picksMode ? (
        <ShortfallPicks
          justEnough={justEnough}
          best={best}
          selectedId={selectedId}
          onSelect={(p) => setPicked(p.id)}
          balance={have}
          needed={need}
        />
      ) : (
        <PackGrid packs={packs} selectedId={selectedId} onSelect={(p) => setPicked(p.id)} compact={packs.length > 2} />
      )}

      {__DEV__ && testMode && <TestModeBanner />}
      {!flags.payments && (
        <Type v="labelMd" tone="error" center>
          {t('coins_buy_off')}
        </Type>
      )}
      {!!error && !busy && (
        <Type v="labelMd" tone="error" center accessibilityLiveRegion="polite">
          {error}
        </Type>
      )}

      <PayButton pack={selected} busy={busy} disabled={!flags.payments} onPress={pay} />
      {picksMode && (
        <Button label={t('see_all_packs')} variant="ghost" block onPress={() => setShowAll(true)} />
      )}
      <Type v="labelSm" tone="onSurfaceFaint" center style={styles.fine}>
        {shortfall ? t('after_payment_return') : t('coins_policy')}
      </Type>
    </>
  );
}

const styles = StyleSheet.create({ fine: { marginTop: 2 } });
