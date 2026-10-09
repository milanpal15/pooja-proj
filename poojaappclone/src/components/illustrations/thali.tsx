import { Image, type ImageSourcePropType, StyleSheet, View } from 'react-native';

import { Flame } from '@/components/illustrations/flame';

/** Real aarti-thali photo (background removed, transparent, square). */
const THALI_IMAGE = require('@/assets/images/thali.png');

/**
 * Aarti thali. By default it renders the real thali photo with an animated
 * flame on top. Pass `image={null}` to force the drawn fallback, or a different
 * `image` source to swap the artwork.
 */
export function Thali({
  size = 92,
  image = THALI_IMAGE,
}: {
  size?: number;
  image?: ImageSourcePropType | null;
}) {
  if (image) {
    return (
      <View style={[styles.root, { width: size, height: size * 0.9 }]}>
        <Image source={image} resizeMode="contain" style={{ width: size, height: size }} />
        {/* Flame sits over the diya, on the right of the plate. */}
        <View style={[styles.flameSlot, { bottom: size * 0.3, left: size * 0.52 }]}>
          <Flame size={size * 0.2} color="#FFB63D" />
        </View>
      </View>
    );
  }

  const plateW = size;
  const plateH = size * 0.42;

  return (
    <View style={[styles.root, { width: size, height: size * 0.8 }]}>
      {/* Plate shadow for depth */}
      <View
        style={[
          styles.shadow,
          { width: plateW * 0.9, height: plateH * 0.7, borderRadius: plateW, bottom: 0 },
        ]}
      />
      {/* Brass plate (oval) */}
      <View style={[styles.plate, { width: plateW, height: plateH, borderRadius: plateW }]}>
        <View
          style={[
            styles.plateInner,
            { width: plateW * 0.8, height: plateH * 0.6, borderRadius: plateW },
          ]}
        />
      </View>

      {/* Offerings sitting on the plate */}
      <View style={[styles.items, { bottom: plateH * 0.32 }]}>
        <Mound color="#D6301F" size={size * 0.13} />
        <Mound color="#F2B01E" size={size * 0.13} />
        <Mound color="#FBF3DC" size={size * 0.13} />
      </View>

      {/* Central diya + flame */}
      <View style={[styles.diyaWrap, { bottom: plateH * 0.5 }]}>
        <View style={[styles.diya, { width: size * 0.3, height: size * 0.16 }]} />
        <View style={styles.flameOnDiya}>
          <Flame size={size * 0.22} color="#FFB63D" />
        </View>
      </View>
    </View>
  );
}

function Mound({ color, size }: { color: string; size: number }) {
  return (
    <View
      style={{
        width: size,
        height: size * 0.8,
        borderTopLeftRadius: size,
        borderTopRightRadius: size,
        borderBottomLeftRadius: size * 0.3,
        borderBottomRightRadius: size * 0.3,
        backgroundColor: color,
      }}
    />
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', justifyContent: 'flex-end' },
  shadow: { position: 'absolute', backgroundColor: 'rgba(0,0,0,0.25)' },
  plate: {
    position: 'absolute',
    bottom: 0,
    backgroundColor: '#E0A02C',
    borderWidth: 2,
    borderColor: '#F8D982',
    alignItems: 'center',
    justifyContent: 'center',
  },
  plateInner: { backgroundColor: '#C8871F', opacity: 0.6 },
  items: {
    position: 'absolute',
    flexDirection: 'row',
    gap: 6,
    alignItems: 'flex-end',
  },
  diyaWrap: { position: 'absolute', alignItems: 'center' },
  diya: {
    backgroundColor: '#B9711B',
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
  },
  flameOnDiya: { position: 'absolute', bottom: 6 },
  flameSlot: { position: 'absolute' },
});
