import { WalletChip } from '@/features/wallet';
import { useAuth } from '@/providers/auth';

import { avatarInitial, firstName } from '../../lib/greeting';
import { HomeHeader } from '../HomeHeader';
import { type BlockProps, useBlock } from './use-block';

/** Pinned above the scroll. The wallet chip needs both the block's `showWallet` and the coin-spending feature being on. */
export function HeaderBlock({ block }: BlockProps) {
  const { t, go, flags, title } = useBlock(block);
  const { user } = useAuth();
  const wallet = block.props.showWallet !== false && flags.astrologerCalls ? <WalletChip /> : undefined;

  return (
    <HomeHeader
      greeting={title || t('hv_greeting')}
      name={firstName(user?.name)}
      initial={avatarInitial(user?.name)}
      profileLabel={t('profile')}
      remindersLabel={t('daily_reminders')}
      wallet={wallet}
      onProfile={() => go('/profile')}
      onReminders={() => go('/alarm')}
    />
  );
}
