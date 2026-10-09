import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Screen, Segmented } from '@/components/ui';
import { AppBar } from '@/components/ui/surface';
import { type Scheme, Space, Surface, type SurfaceMode, ThemeProvider } from '@/theme';

import { GalleryPreview } from './components/GalleryPreview';

/**
 * Design system gallery.
 *
 * Every token and component in one scrollable route, with live scheme and
 * surface toggles — the point being that you can watch the whole kit re-tone
 * rather than trusting that it does. Dev-only; reached from Profile.
 *
 * The contrast column is deliberate. The export's gold headings measured
 * 2.3:1 on cream and shipped anyway, because swatches look fine next to each
 * other. Printing the measured ratio makes that failure mode loud.
 */
export function GalleryScreen() {
  const [scheme, setScheme] = useState<Scheme>('light');
  const [mode, setMode] = useState<SurfaceMode>('cream');

  return (
    <Screen tabBar={false}>
      <AppBar title="Design System" subtitle="SACRED DEVOTION" />

      {/* The controls live outside the previewed theme so they stay legible
          whatever the preview is set to. */}
      <View style={styles.controls}>
        <Segmented
          options={[
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
          value={scheme}
          onChange={setScheme}
        />
        <Segmented
          options={[
            { value: 'cream', label: 'Cream' },
            { value: 'sanctum', label: 'Sanctum' },
          ]}
          value={mode}
          onChange={setMode}
        />
      </View>

      <ThemeProvider scheme={scheme}>
        <Surface mode={mode}>
          <GalleryPreview />
        </Surface>
      </ThemeProvider>
    </Screen>
  );
}

const styles = StyleSheet.create({
  controls: { paddingHorizontal: Space.margin, paddingBottom: Space.md, gap: Space.sm },
});
