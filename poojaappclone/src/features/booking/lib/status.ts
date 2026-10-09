import type { StringKey } from '@/i18n';
import type { BookingStatus, ChadhavaOrder } from '@/lib/api';

export type ChipTone = 'accent' | 'primary' | 'live' | 'success';

/** Label + colour for a pooja booking status. */
export function poojaStatusChip(s: BookingStatus): { label: StringKey; tone: ChipTone } {
  switch (s) {
    case 'performed':
      return { label: 'ps_st_performed', tone: 'success' };
    case 'sankalp':
      return { label: 'ps_st_sankalp', tone: 'primary' };
    case 'cancelled':
      return { label: 'ps_st_cancelled', tone: 'live' };
    default:
      return { label: 'ps_st_booked', tone: 'accent' };
  }
}

export function orderStatusChip(s: ChadhavaOrder['status']): { label: StringKey; tone: ChipTone } {
  switch (s) {
    case 'offered':
      return { label: 'cs_status_offered', tone: 'success' };
    case 'cancelled':
      return { label: 'cs_status_cancelled', tone: 'live' };
    default:
      return { label: 'cs_status_booked', tone: 'accent' };
  }
}

/** A chadhava order may be cancelled only while still `booked` (the server also checks the listing window). */
export const canCancelOrder = (o: Pick<ChadhavaOrder, 'status'>): boolean => o.status === 'booked';
