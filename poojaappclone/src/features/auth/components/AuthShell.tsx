import { KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuthBackdrop } from './AuthBackdrop';

/** Backdrop + safe area + keyboard avoidance (iOS only) shared by every step. */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthBackdrop>
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {children}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </AuthBackdrop>
  );
}
