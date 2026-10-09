import type { NewBooking } from '@/lib/api';

import type { Address, NameEntry } from './names';

type Input = {
  poojaSlug: string;
  packageKey: string;
  names: NameEntry[];
  prasad: boolean;
  address: Address;
};

/** The body minus `requestId`. Trimmed; the address is sent only when prasad is wanted. */
export function bookingBody(i: Input): Omit<NewBooking, 'requestId'> {
  return {
    poojaSlug: i.poojaSlug,
    packageKey: i.packageKey,
    names: i.names.map((n) => ({ name: n.name.trim(), gotra: n.gotra.trim() })),
    prasad: i.prasad,
    ...(i.prasad
      ? {
          address: {
            line1: i.address.line1.trim(),
            city: i.address.city.trim(),
            pincode: i.address.pincode.trim(),
          },
        }
      : {}),
  };
}

/** Identifies the order's contents for the idempotency key (see `request-key.ts`). */
export const bookingSignature = (i: Input): string => JSON.stringify(bookingBody(i));
