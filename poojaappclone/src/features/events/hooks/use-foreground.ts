import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

/**
 * True only while this screen is focused AND the app is in the foreground. Location is read only
 * then (docs/EVENTS.md §11 principle 2: no background tracking) — the watcher is torn down the moment
 * either turns false.
 */
export function useForeground(): boolean {
  const [focused, setFocused] = useState(false);
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setAppActive(s === 'active'));
    return () => sub.remove();
  }, []);
  return focused && appActive;
}
