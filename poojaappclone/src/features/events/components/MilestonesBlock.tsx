import { StyleSheet, View } from 'react-native';

import { Icon, Type } from '@/components/ui';
import { useLanguage } from '@/i18n';
import type { EventDetail, EventMilestone, EventTask, ProgressResponse } from '@/lib/api';
import { pick } from '@/lib/localized';
import { Radius, useTheme } from '@/theme';

import {
  clockTime,
  currentMilestoneIndex,
  fill,
  isSupportedTask,
  longDate,
  milestoneSummary,
  shortDate,
  taskDone,
} from '../lib/events-logic';
import { Ring } from './Ring';
import { TaskAction } from './TaskRenderers';

const ORDER_KEY = { daily: 'ev_order_daily', sequential: 'ev_order_sequential', any: 'ev_order_any' } as const;
const KIND_KEY: Record<string, string> = {
  self_mark: 'ev_k_self_mark',
  counter: 'ev_k_counter',
  live_darshan: 'ev_k_live_darshan',
  bhajan_listened: 'ev_k_bhajan_listened',
  chadhava_offered: 'ev_k_chadhava_offered',
  pooja_booked: 'ev_k_pooja_booked',
  location: 'ev_k_location',
  qr_checkin: 'ev_k_qr_checkin',
  photo: 'ev_k_photo',
};

type Actions = { onProgress: (milestoneKey: string, res: ProgressResponse) => void; reload: () => void };

/**
 * `milestones` block: a timeline whose locked / open / done look comes entirely from server data
 * (`locked`, `done`/`completedAt`). What a task offers (mark done, the counter, "coming soon") comes from
 * the `TASK_RENDERERS` registry by task kind — this block never names a kind.
 */
export function MilestonesBlock({ event, onProgress, reload }: { event: EventDetail } & Actions) {
  const { t } = useLanguage();
  const items = event.milestones?.items ?? [];
  if (items.length === 0) return null;
  const sum = milestoneSummary(items);
  const current = currentMilestoneIndex(items, event.me?.currentMilestoneKey);
  const prog = event.me?.progress;
  const orderKey = ORDER_KEY[(event.milestones?.order ?? '') as keyof typeof ORDER_KEY];

  return (
    <View style={styles.wrap}>
      {prog && prog.total > 0 && (
        <SummaryCard done={prog.done} total={prog.total} />
      )}
      <View style={styles.head}>
        <Type v="titleMd">{t('ev_milestones')}</Type>
        {!!orderKey && (
          <Type v="bodySm" tone="onSurfaceVariant">
            {t(orderKey)}
          </Type>
        )}
      </View>
      <View>
        {items.map((m, i) => (
          <Row key={m.key} event={event} m={m} index={i} last={i === items.length - 1} state={sum.states[i]} current={i === current} actions={{ onProgress, reload }} />
        ))}
      </View>
    </View>
  );
}

function SummaryCard({ done, total }: { done: number; total: number }) {
  const { c } = useTheme();
  const { t } = useLanguage();
  return (
    <View style={[styles.summary, { backgroundColor: c.containerLowest, borderColor: c.outlineVariant }]}>
      <Ring done={done} total={total} label={t('ev_done_word')} />
      <Type v="titleSm" style={styles.flex}>
        {fill(t('ev_m_of'), { done, total })}
      </Type>
    </View>
  );
}

function Row({ event, m, index, last, state, current, actions }: { event: EventDetail; m: EventMilestone; index: number; last: boolean; state: 'locked' | 'open' | 'done'; current: boolean; actions: Actions }) {
  const { c } = useTheme();
  const { t, lang } = useLanguage();
  const title = pick(lang, m.title, m.titleHi);
  const sub =
    state === 'done'
      ? m.completedAt
        ? fill(t('ev_m_done'), { date: shortDate(m.completedAt) })
        : t('ev_m_done_a11y')
      : m.opensAt
        ? fill(t('ev_m_opens'), { date: longDate(m.opensAt), time: clockTime(m.opensAt) })
        : state === 'open'
          ? t('ev_m_open_now')
          : '';
  const tasks = state === 'open' ? (m.tasks ?? []) : [];

  return (
    <View style={styles.mrow} accessibilityLabel={`${title}. ${state === 'done' ? t('ev_m_done_a11y') : state === 'locked' ? t('ev_m_locked_a11y') : ''}`}>
      <View style={styles.rail}>
        <View
          style={[
            styles.dot,
            state === 'done' && { backgroundColor: c.success, borderColor: c.success },
            state === 'open' && { borderColor: c.accent, borderWidth: 2.5, backgroundColor: c.containerLowest },
            state === 'locked' && { backgroundColor: c.container, borderColor: c.container },
          ]}>
          {state === 'done' ? (
            <Icon name="check" size={18} color="#FFFFFF" />
          ) : state === 'locked' ? (
            <Icon name="clock" size={16} color={c.onSurfaceFaint} />
          ) : (
            <Type v="titleSm" tone="primary" numeric>
              {index + 1}
            </Type>
          )}
        </View>
        {!last && <View style={[styles.line, { backgroundColor: state === 'done' ? c.success : c.outlineVariant }]} />}
      </View>
      <View style={[styles.mbody, state === 'locked' && { opacity: 0.6 }]}>
        <Type v="titleSm" numberOfLines={2}>
          {title}
        </Type>
        {!!sub && (
          <Type v="bodySm" tone="onSurfaceVariant">
            {sub}
          </Type>
        )}
        {tasks.length > 0 && (
          <View style={[styles.tasks, { backgroundColor: c.containerLowest, borderColor: current ? c.accent : c.outlineVariant }]}>
            {tasks.map((task, i) => (
              <TaskRow key={task.key} event={event} milestone={m} task={task} first={i === 0} actions={actions} />
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

function TaskRow({ event, milestone, task, first, actions }: { event: EventDetail; milestone: EventMilestone; task: EventTask; first: boolean; actions: Actions }) {
  const { c } = useTheme();
  const { t, lang } = useLanguage();
  const done = taskDone(task);
  const supported = isSupportedTask(task.kind);
  const kindLabel = supported ? t((KIND_KEY[task.kind] ?? 'ev_k_self_mark') as 'ev_k_self_mark') : '';
  return (
    <View style={[styles.task, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.outlineVariant }]}>
      <View style={styles.taskTop}>
        <View style={[styles.tick, done ? { backgroundColor: c.success, borderColor: c.success } : { borderColor: c.accent }]}>
          {done && <Icon name="check" size={13} color="#FFFFFF" />}
        </View>
        <Type v="bodyMd" tone={done ? 'onSurfaceVariant' : 'onSurface'} style={[styles.flex, done && styles.struck]}>
          {pick(lang, task.title, task.titleHi)}
        </Type>
        {!!kindLabel && (
          <View style={[styles.kind, { backgroundColor: c.container }]}>
            <Type v="labelSm" tone="onSurfaceVariant" style={styles.kindText}>
              {kindLabel}
            </Type>
          </View>
        )}
      </View>
      <TaskAction event={event} milestone={milestone} task={task} onProgress={actions.onProgress} reload={actions.reload} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 16 },
  flex: { flex: 1, minWidth: 0 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 16, borderRadius: Radius.lg + 2, borderWidth: 1, padding: 14 },
  mrow: { flexDirection: 'row', gap: 14 },
  rail: { width: 40, alignItems: 'center' },
  dot: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  line: { width: 2, flex: 1, minHeight: 14, marginVertical: 2 },
  mbody: { flex: 1, minWidth: 0, paddingBottom: 18, gap: 2, paddingTop: 2 },
  tasks: { marginTop: 8, borderRadius: Radius.lg, borderWidth: 1, paddingHorizontal: 12 },
  task: { paddingVertical: 12, gap: 8 },
  taskTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  tick: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  struck: { textDecorationLine: 'line-through' },
  kind: { paddingHorizontal: 8, height: 22, borderRadius: Radius.full, justifyContent: 'center' },
  kindText: { fontSize: 11 },
});
