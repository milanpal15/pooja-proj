import { useState } from 'react';

import { api } from '../api/index.js';
import { useToast } from '../../ui/index.js';

/**
 * Upload one image at a time and hand back its stored URL. `busy` is the key
 * of what is uploading (so one row's button spins, not all of them); a failure
 * is a toast with the API's own sentence and resolves to null.
 *
 *   const { busy, upload } = useUpload();
 *   const url = await upload(file, 'pkg-2');
 */
export function useUpload() {
  const toast = useToast();
  const [busy, setBusy] = useState('');
  const upload = async (file, key = 'file') => {
    setBusy(key);
    try {
      const { url } = await api.upload(file);
      return url;
    } catch (e) {
      toast.error(`Upload failed. ${e.message}`);
      return null;
    } finally {
      setBusy('');
    }
  };
  return { busy, upload };
}
