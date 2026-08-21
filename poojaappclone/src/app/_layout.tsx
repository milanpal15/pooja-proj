import {
  DarkTheme,
  DefaultTheme,
  type ErrorBoundaryProps,
  Stack,
  ThemeProvider,
  usePathname,
} from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Radius, Sacred, Space } from '@/constants/sacred';

import { LanguageScreen } from '@/components/auth/language-screen';
import { LoginScreen } from '@/components/auth/login-screen';
import { AdminProvider, useAdmin } from '@/context/admin';
import { AuthProvider, useAuth } from '@/context/auth';
import { ContentProvider } from '@/context/content';
import { LanguageProvider, useLanguage } from '@/context/language';
import { ThemeProvider as SacredThemeProvider, useSacredFonts } from '@/theme';

SplashScreen.preventAutoHideAsync();

export default function TabLayout() {
  const colorScheme = useColorScheme();
  return (
    // Required by react-native-gesture-handler for the carousel and aarti drag.
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        {/* Sacred Devotion tokens. Sits outside the data providers so every
            screen — including the auth gate — can read colours and type. */}
        <SacredThemeProvider>
          <LanguageProvider>
            <AuthProvider>
              <AdminProvider>
                <ContentProvider>
                  <RootGate />
                </ContentProvider>
              </AdminProvider>
            </AuthProvider>
          </LanguageProvider>
        </SacredThemeProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

/** Onboarding gate: pick language (first launch) → sign in → app. */
function RootGate() {
  const { lang, loading: langLoading } = useLanguage();
  const { user, loading: authLoading } = useAuth();
  // Hold the splash until the typefaces are registered too — otherwise the
  // first frame renders in the system face and visibly re-flows a beat later.
  const fontsReady = useSacredFonts();
  const ready = !langLoading && !authLoading && fontsReady;

  // Hide the native splash once prefs have loaded (this used to live in the
  // now-removed AnimatedSplashOverlay — without it the app hangs on the splash).
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  // Keep a blank warm screen while persisted prefs load (native splash is up).
  if (!ready) return <View style={{ flex: 1, backgroundColor: '#C9741B' }} />;

  if (!lang) return <LanguageScreen />;
  if (!user) return <LoginScreen />;

  // Authenticated: a Stack whose first screen is the (tabs) group. Sub-screens
  // (temples-map, darshan, chadhava, journal, admin) are sibling stack routes.
  return (
    <>
      <ScreenTracker />
      <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
        <Stack.Screen name="(tabs)" />
      </Stack>
    </>
  );
}

/**
 * Catches any render error in the route tree and shows a recoverable screen
 * instead of Expo Go's fatal error / a silent white screen. Expo Router picks
 * this up automatically because it's a named `ErrorBoundary` export.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <View style={ebStyles.root}>
      <SafeAreaView style={ebStyles.safe}>
        <Text style={ebStyles.om}>ॐ</Text>
        <Text style={ebStyles.title}>Something needs a moment</Text>
        <Text style={ebStyles.sub}>
          The app hit an unexpected error. You can try again — your data is safe.
        </Text>
        <ScrollView style={ebStyles.box} contentContainerStyle={ebStyles.boxInner}>
          <Text style={ebStyles.msg}>{error?.message || String(error)}</Text>
        </ScrollView>
        <Pressable style={ebStyles.btn} onPress={retry}>
          <Text style={ebStyles.btnText}>Try again</Text>
        </Pressable>
      </SafeAreaView>
    </View>
  );
}

const ebStyles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Sacred.surface },
  safe: { flex: 1, padding: Space.containerMargin, justifyContent: 'center', gap: 12 },
  om: { fontSize: 44, color: Sacred.primary, textAlign: 'center' },
  title: { fontSize: 22, fontWeight: '800', color: Sacred.onSurface, textAlign: 'center' },
  sub: { fontSize: 14, color: Sacred.onSurfaceVariant, textAlign: 'center', marginBottom: 8 },
  box: {
    maxHeight: 180,
    backgroundColor: Sacred.containerLow,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Sacred.outlineVariant,
  },
  boxInner: { padding: 12 },
  msg: { fontSize: 12, color: Sacred.error, fontFamily: 'monospace' },
  btn: {
    backgroundColor: Sacred.primary,
    borderRadius: Radius.full,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});

/** Records a screen view whenever the route changes (local analytics). */
function ScreenTracker() {
  const pathname = usePathname();
  const { trackScreen } = useAdmin();
  useEffect(() => {
    trackScreen(pathname || '/');
  }, [pathname, trackScreen]);
  return null;
}
