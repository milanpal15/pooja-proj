import { useContext } from 'react';

import { ContentContext } from './context';

export function useContent() {
  return useContext(ContentContext);
}
