import { useContext } from 'react';

import { AdminContext } from './context';

export function useAdmin() {
  return useContext(AdminContext);
}
