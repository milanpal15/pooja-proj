import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet } from 'react-native';

import { Screen, SectionBand, Type } from '@/components/ui';
import { AppBar } from '@/components/ui/surface';
import { Space } from '@/theme';

import { AddReminder } from './components/AddReminder';
import { FullScreenNotice } from './components/FullScreenNotice';
import { PermissionBanner } from './components/PermissionBanner';
import { ReminderList } from './components/ReminderList';
import { ToneCard } from './components/ToneCard';
import { useAlarmScreen } from './hooks/use-alarm-screen';

/**
 * Aarti reminders — the "Alarm" tile.
 *
 * Not a general alarm clock: the times that matter are the temple's own, so
 * the five defaults follow the traditional daily cycle and a devotee who
 * enables one without editing anything still gets it at the right hour.
 *
 * These are repeating LOCAL notifications. Nothing leaves the device, so they
 * keep working with no backend and no network — which is the whole point at
 * 4:30am for Mangala Aarti.
 *
 * ── Two layout rules this screen learned the hard way ────────────────────
 *
 *  1. Nothing may be sized by the time string. "4:30 AM" and "12:30 PM" are
 *     different widths, so any element that lets the text set its own width
 *     jumps as the hour is stepped — including under the finger doing the
 *     stepping. Every time display has a fixed width and centres inside it.
 *  2. The time has to look tappable. It was plain text with the word "edit"
 *     beside it, which nobody reads as a control. It is a bordered chip with
 *     a calendar glyph and a chevron now.
 */
export function AlarmScreen() {
  const router = useRouter();
  const { scroller, ...a } = useAlarmScreen();
  const { hi } = a;

  return (
    <Screen tabBar={false}>
      <AppBar
        title={hi ? 'आरती अलार्म' : 'Aarti Reminders'}
        subtitle={
          a.loaded
            ? `${a.activeCount} ${hi ? 'चालू' : a.activeCount === 1 ? 'REMINDER ON' : 'REMINDERS ON'}`
            : undefined
        }
      />

      <ScrollView
        ref={scroller}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        /* Without this the first tap on Cancel / Add only dismisses the
           keyboard, so the button appears not to work. */
        keyboardShouldPersistTaps="handled">
        {a.permission === 'denied' && a.activeCount > 0 && <PermissionBanner hi={hi} />}

        <SectionBand title={hi ? 'दैनिक आरती' : 'The Daily Cycle'} tone="gold">
          <ReminderList
            reminders={a.reminders}
            hi={hi}
            enabled={a.state.enabled}
            editing={a.editing}
            nextAt={a.nextAt}
            now={a.now}
            onToggle={(id) => void a.attemptToggle(id)}
            onToggleEditor={(id, open) => a.setEditing(open ? null : id)}
            onChangeTime={(id, h, m) => a.setTime(id, h, m)}
            onDone={() => a.setEditing(null)}
            onDelete={(r) => a.confirmDelete(r.id, hi ? r.titleHi : r.title, r.custom)}
            onPreview={a.isRealAlarm ? a.preview : undefined}
          />
          <AddReminder
            hi={hi}
            adding={a.adding}
            hasRemovedDefaults={a.hasRemovedDefaults}
            onChange={a.setAdding}
            onCancel={() => a.setAdding(null)}
            onSubmit={() => void a.submitNew()}
            onOpen={() => {
              a.setEditing(null);
              a.setAdding({ title: '', hour: 6, minute: 0 });
            }}
            onRestore={() => void a.restoreDefaults()}
          />
        </SectionBand>

        <ToneCard hi={hi} tone={a.tone} onPress={() => router.push('/ringtone')} />

        {a.isRealAlarm && !a.canFullScreen && (
          <FullScreenNotice hi={hi} onAllow={() => void a.openFullScreenSettings()} />
        )}

        <Type v="bodySm" tone="onSurfaceFaint">
          {hi
            ? a.isRealAlarm
              ? 'ये अलार्म आपके फ़ोन पर ही सेट होते हैं — इंटरनेट के बिना भी बजते हैं, और साइलेंट मोड में भी।'
              : 'ये सूचनाएँ आपके फ़ोन पर ही निर्धारित होती हैं। इंटरनेट के बिना भी चलती हैं।'
            : a.isRealAlarm
              ? 'These ring on your phone itself — with no network and no account, and at alarm volume even when the phone is silenced.'
              : 'These are scheduled on your phone itself, so they arrive with no network and no account.'}
        </Type>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: Space.margin, gap: Space.md },
});
