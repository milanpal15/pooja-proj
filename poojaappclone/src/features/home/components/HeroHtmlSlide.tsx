import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { Type } from '@/components/ui';
import { useTheme } from '@/theme';

import { useOpenHref } from '../hooks/use-open-href';
import { classifyNavigation } from '../lib/html';
import type { HomeSlide } from '../types';

/**
 * A dashboard-authored HTML slide. The markup is sanitised by the API, and is
 * contained again here: JavaScript off, no network origin but `about:blank`, a
 * CSP in the document, and every navigation intercepted — `bhakti://route` goes
 * to the router, `https:` to the browser, everything else is dropped.
 *
 * A toned title card stands in until the page has loaded. When the slide has an
 * `href` the whole slide is one tap target (an overlay over the page); without
 * one, links inside the HTML work.
 */
export function HeroHtmlSlide({ slide, onPress }: { slide: HomeSlide; onPress?: () => void }) {
  const { c } = useTheme();
  const open = useOpenHref();
  const [loaded, setLoaded] = useState(false);

  return (
    <View style={[styles.frame, { backgroundColor: c.accentContainer, borderColor: c.goldHairline }]}>
      <WebView
        style={styles.web}
        source={{ html: slide.html ?? '' }}
        originWhitelist={['about:blank']}
        javaScriptEnabled={false}
        domStorageEnabled={false}
        scrollEnabled={false}
        setSupportMultipleWindows={false}
        allowsLinkPreview={false}
        onLoadEnd={() => setLoaded(true)}
        onShouldStartLoadWithRequest={(req) => {
          const action = classifyNavigation(req.url);
          if (action === 'load') return true;
          if (action === 'route' || action === 'external') open(req.url);
          return false;
        }}
      />
      {!loaded && (
        <View style={[styles.placeholder, { backgroundColor: c.accentContainer }]} pointerEvents="none">
          <Type v="titleLg" tone="primary" center numberOfLines={3}>
            {slide.title}
          </Type>
        </View>
      )}
      {!!onPress && <Pressable accessibilityRole="button" onPress={onPress} style={StyleSheet.absoluteFill} />}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1, borderRadius: 20, overflow: 'hidden', borderWidth: 1 },
  web: { flex: 1, backgroundColor: 'transparent' },
  placeholder: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', padding: 20 },
});
