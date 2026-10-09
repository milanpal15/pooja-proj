import { useCallback, useState } from 'react';

import type { Temple } from '@/constants/temples';

import { useMapCamera } from './use-map-camera';

/** Which temple is selected, and the camera moves that selecting (or clearing) makes. */
export function useTempleMap() {
  const [selected, setSelected] = useState<Temple | null>(null);
  const { camera, cameraStyle, onViewport, flyTo, resetCamera } = useMapCamera();

  const focusOn = useCallback(
    (t: Temple) => {
      setSelected(t);
      flyTo(t.map);
    },
    [flyTo],
  );

  const resetView = useCallback(() => {
    setSelected(null);
    resetCamera();
  }, [resetCamera]);

  return { selected, focusOn, resetView, camera, cameraStyle, onViewport };
}
