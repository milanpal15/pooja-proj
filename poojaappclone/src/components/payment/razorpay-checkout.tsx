import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Radius, Sacred } from '@/constants/sacred';

type Method = 'upi' | 'card';
type Phase = 'form' | 'processing' | 'success' | 'failed';

/**
 * A dummy Razorpay-style checkout. Mimics the branded sheet and flow
 * (UPI / Card → processing → result) without any real gateway or keys.
 */
export function RazorpayCheckout({
  visible,
  amount,
  name = 'Divine Temple Portal',
  onClose,
  onResult,
}: {
  visible: boolean;
  amount: number;
  name?: string;
  onClose: () => void;
  onResult: (status: 'success' | 'failed', method: string) => void;
}) {
  const [method, setMethod] = useState<Method>('upi');
  const [phase, setPhase] = useState<Phase>('form');
  const [vpa, setVpa] = useState('');
  const [card, setCard] = useState('');

  // Reset each time the sheet opens (intentional effect-driven reset).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (visible) {
      setPhase('form');
      setMethod('upi');
      setVpa('');
      setCard('');
    }
  }, [visible]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const pay = () => {
    setPhase('processing');
    // Simulate gateway round-trip; ~90% success.
    setTimeout(() => {
      const ok = Math.random() > 0.1;
      setPhase(ok ? 'success' : 'failed');
      onResult(ok ? 'success' : 'failed', method === 'upi' ? 'UPI' : 'Card');
    }, 1600);
  };

  const canPay =
    method === 'upi' ? /^[\w.-]+@[\w.-]+$/.test(vpa) : card.replace(/\s/g, '').length >= 12;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          {/* Razorpay-style header */}
          <View style={styles.header}>
            <View style={styles.brandRow}>
              <View style={styles.rzpLogo}>
                <Text style={styles.rzpLogoText}>R</Text>
              </View>
              <Text style={styles.rzpName}>Razorpay</Text>
              <Text style={styles.testTag}>TEST</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12}>
              <Text style={styles.close}>✕</Text>
            </Pressable>
          </View>

          <View style={styles.merchantRow}>
            <Text style={styles.merchant}>{name}</Text>
            <Text style={styles.amount}>₹{amount.toFixed(2)}</Text>
          </View>

          {phase === 'form' && (
            <View style={styles.body}>
              <View style={styles.tabs}>
                {(['upi', 'card'] as Method[]).map((m) => (
                  <Pressable
                    key={m}
                    onPress={() => setMethod(m)}
                    style={[styles.tab, method === m && styles.tabActive]}>
                    <Text style={[styles.tabText, method === m && styles.tabTextActive]}>
                      {m === 'upi' ? 'UPI' : 'Card'}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {method === 'upi' ? (
                <TextInput
                  style={styles.input}
                  value={vpa}
                  onChangeText={setVpa}
                  placeholder="yourname@upi"
                  placeholderTextColor={Sacred.outline}
                  autoCapitalize="none"
                  keyboardType="email-address"
                />
              ) : (
                <TextInput
                  style={styles.input}
                  value={card}
                  onChangeText={(x) =>
                    setCard(
                      x
                        .replace(/\D/g, '')
                        .slice(0, 16)
                        .replace(/(.{4})/g, '$1 ')
                        .trim(),
                    )
                  }
                  placeholder="4111 1111 1111 1111"
                  placeholderTextColor={Sacred.outline}
                  keyboardType="number-pad"
                />
              )}

              <Pressable
                style={[styles.payBtn, !canPay && styles.payBtnOff]}
                disabled={!canPay}
                onPress={pay}>
                <Text style={styles.payText}>Pay ₹{amount.toFixed(2)}</Text>
              </Pressable>
              <Text style={styles.secure}>🔒 Dummy gateway · no real charge</Text>
            </View>
          )}

          {phase === 'processing' && (
            <View style={styles.center}>
              <ActivityIndicator size="large" color="#0C4A9E" />
              <Text style={styles.centerText}>Processing payment…</Text>
            </View>
          )}

          {phase === 'success' && (
            <View style={styles.center}>
              <View style={[styles.resultIcon, { backgroundColor: '#1E8E3E' }]}>
                <Text style={styles.resultTick}>✓</Text>
              </View>
              <Text style={styles.centerText}>Payment Successful</Text>
              <Pressable style={styles.doneBtn} onPress={onClose}>
                <Text style={styles.doneText}>Done</Text>
              </Pressable>
            </View>
          )}

          {phase === 'failed' && (
            <View style={styles.center}>
              <View style={[styles.resultIcon, { backgroundColor: Sacred.error }]}>
                <Text style={styles.resultTick}>✕</Text>
              </View>
              <Text style={styles.centerText}>Payment Failed</Text>
              <Pressable style={styles.doneBtn} onPress={() => setPhase('form')}>
                <Text style={styles.doneText}>Retry</Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 28,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0C4A9E',
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rzpLogo: {
    width: 26,
    height: 26,
    borderRadius: 6,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rzpLogoText: { color: '#0C4A9E', fontWeight: '900', fontSize: 16 },
  rzpName: { color: '#fff', fontWeight: '800', fontSize: 18 },
  testTag: {
    color: '#0C4A9E',
    backgroundColor: '#FFD54A',
    fontWeight: '800',
    fontSize: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  close: { color: '#fff', fontSize: 18, fontWeight: '700' },
  merchantRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  merchant: { fontSize: 16, fontWeight: '700', color: '#1a1a1a' },
  amount: { fontSize: 18, fontWeight: '900', color: '#1a1a1a' },

  body: { padding: 18, gap: 14 },
  tabs: { flexDirection: 'row', backgroundColor: '#f0f2f5', borderRadius: Radius.md, padding: 4 },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  tabActive: { backgroundColor: '#0C4A9E' },
  tabText: { fontWeight: '700', color: '#5b6470' },
  tabTextActive: { color: '#fff' },
  input: {
    borderWidth: 1.5,
    borderColor: '#d5dae0',
    borderRadius: Radius.md,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
    color: '#1a1a1a',
  },
  payBtn: {
    backgroundColor: '#0C4A9E',
    borderRadius: Radius.md,
    paddingVertical: 15,
    alignItems: 'center',
  },
  payBtnOff: { opacity: 0.5 },
  payText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  secure: { textAlign: 'center', color: '#8a929c', fontSize: 12 },

  center: { padding: 32, alignItems: 'center', gap: 14 },
  centerText: { fontSize: 18, fontWeight: '700', color: '#1a1a1a' },
  resultIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  resultTick: { color: '#fff', fontSize: 34, fontWeight: '900' },
  doneBtn: {
    backgroundColor: '#0C4A9E',
    borderRadius: Radius.full,
    paddingHorizontal: 40,
    paddingVertical: 12,
    marginTop: 6,
  },
  doneText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
