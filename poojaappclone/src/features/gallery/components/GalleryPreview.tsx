import { ScrollView, StyleSheet, View } from 'react-native';

import { Mandala } from '@/components/ui';
import { Space, useTheme } from '@/theme';

import { useSampleArt } from '../hooks/use-sample-art';

import { ArchSection } from './ArchSection';
import { ButtonsSection } from './ButtonsSection';
import { CardsSection } from './CardsSection';
import { ChipsSection } from './ChipsSection';
import { ContrastSection } from './ContrastSection';
import { DividerSection } from './DividerSection';
import { ElevationSection } from './ElevationSection';
import { IconsSection } from './IconsSection';
import { MandalaSection } from './MandalaSection';
import { RowsSection } from './RowsSection';
import { SegmentedSection } from './SegmentedSection';
import { SurfacesSection } from './SurfacesSection';
import { TypeScaleSection } from './TypeScaleSection';

/** Every section, rendered inside whichever theme the toggles chose. */
export function GalleryPreview() {
  const sampleArt = useSampleArt();

  const { c, isSanctum } = useTheme();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.surface }}
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}>
      {isSanctum && (
        <Mandala size={460} opacity={0.08} petals={20} style={styles.backdropMandala} />
      )}

      <ContrastSection />
      <SurfacesSection />
      <TypeScaleSection />
      <IconsSection />
      <ButtonsSection />
      <CardsSection />
      <ArchSection sampleArt={sampleArt} />
      <RowsSection />
      <ChipsSection />
      <SegmentedSection />
      <DividerSection />
      <ElevationSection />
      <MandalaSection />

      <View style={{ height: Space.xxl }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: Space.margin, paddingTop: Space.md },
  backdropMandala: { position: 'absolute', top: 40, alignSelf: 'center' },
});
