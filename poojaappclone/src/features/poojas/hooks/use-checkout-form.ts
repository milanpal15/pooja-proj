import { useMemo, useState } from 'react';

import type { PoojaDetail, PoojaPackage } from '@/lib/api';

import { billFor } from '../lib/bill';
import {
  type Address,
  isFormValid,
  type NameEntry,
  resizeNames,
  validateAddress,
  validateNames,
} from '../lib/names';

const NO_ADDRESS: Address = { line1: '', city: '', pincode: '' };

/**
 * The checkout form: one name+gotra per person, the prasad toggle and its
 * address. Errors stay hidden until the first "Pay" tap (`reveal`), so a
 * devotee is not scolded for fields they have not reached yet.
 */
export function useCheckoutForm(pooja: PoojaDetail, pkg: PoojaPackage, profileName: string) {
  const [names, setNames] = useState<NameEntry[]>(() => resizeNames([], pkg.persons, profileName));
  const [prasad, setPrasad] = useState(false);
  const [address, setAddress] = useState<Address>(NO_ADDRESS);
  const [revealed, setRevealed] = useState(false);

  const setName = (i: number, patch: Partial<NameEntry>) =>
    setNames((prev) => prev.map((n, j) => (j === i ? { ...n, ...patch } : n)));

  const nameErrors = useMemo(() => validateNames(names, pkg.persons), [names, pkg.persons]);
  const addressErrors = useMemo(() => (prasad ? validateAddress(address) : {}), [prasad, address]);
  const bill = billFor(pkg.coins, pooja.prasadFeeCoins, prasad);

  return {
    names,
    setName,
    prasad,
    setPrasad,
    address,
    setAddress: (patch: Partial<Address>) => setAddress((a) => ({ ...a, ...patch })),
    nameErrors: revealed ? nameErrors : [],
    addressErrors: revealed ? addressErrors : {},
    valid: isFormValid(names, pkg.persons, prasad, address),
    reveal: () => setRevealed(true),
    bill,
  };
}
