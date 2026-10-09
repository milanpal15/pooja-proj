import { BalanceLines, BillRow, Card } from '@/components/ui';
import { useLanguage } from '@/i18n';
import { useTheme } from '@/theme';

import type { Bill } from '../lib/bill';

/** The itemised bill in coins, with the balance before and after paying. */
export function BillCard({
  packageName,
  bill,
  balance,
}: {
  packageName: string;
  bill: Bill;
  balance: number | null;
}) {
  const { t } = useLanguage();
  const { c } = useTheme();
  return (
    <Card variant="sunken" style={{ backgroundColor: c.container, borderRadius: 18, padding: 16 }}>
      <BillRow label={packageName} coins={bill.packageCoins} />
      {bill.prasadCoins > 0 && <BillRow label={t('ps_bill_prasad')} coins={bill.prasadCoins} />}
      <BillRow label={t('ps_bill_total')} coins={bill.total} strong last />

      <BalanceLines balance={balance} total={bill.total} />
    </Card>
  );
}
