import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Platform,
  ActivityIndicator,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { format } from 'date-fns';
import { useColors } from '@/hooks/useColors';
import {
  useListActivities,
  useListDueReviews,
  useGetTodaySummary,
  useUpdateActivity,
  useListReflections,
  customFetch,
  Activity,
  ActivityStatus,
} from '@workspace/api-client-react';

function todayStr() {
  return format(new Date(), 'yyyy-MM-dd');
}

const CATEGORY_COLOR: Record<string, string> = {
  SELL: '#4DD4C1',
  CX: '#3FD07A',
  BUILD: '#7C8CFF',
  ADMIN: '#9AA6BF',
};

const STATUS_ICONS: Record<string, string> = {
  done: 'check-circle',
  pending: 'circle',
  skipped: 'slash',
  delegated: 'user',
  deferred: 'clock',
};

function ActivityRow({
  item,
  onToggle,
  colors,
}: {
  item: Activity;
  onToggle: (item: Activity) => void;
  colors: ReturnType<typeof useColors>;
}) {
  const isDone = item.status === 'done';
  const catColor = CATEGORY_COLOR[item.category] ?? colors.mutedForeground;
  const iconName = STATUS_ICONS[item.status] ?? 'circle';

  return (
    <TouchableOpacity
      style={[styles.actRow, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={() => onToggle(item)}
      activeOpacity={0.75}
    >
      <Feather
        name={iconName as any}
        size={20}
        color={isDone ? colors.success : colors.mutedForeground}
        style={styles.actIcon}
      />
      <View style={styles.actBody}>
        <Text
          style={[
            styles.actTitle,
            { color: isDone ? colors.mutedForeground : colors.foreground },
            isDone && styles.actTitleDone,
          ]}
          numberOfLines={2}
        >
          {item.title}
        </Text>
        <View style={styles.actMeta}>
          <View style={[styles.catBadge, { backgroundColor: catColor + '22' }]}>
            <Text style={[styles.catText, { color: catColor }]}>{item.category}</Text>
          </View>
          <Text style={[styles.effortText, { color: colors.mutedForeground }]}>
            {item.effortMinutes}m
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ── Energy Slider ──────────────────────────────────────────────────────────
function EnergySlider({
  value,
  onChange,
  colors,
}: {
  value: number;
  onChange: (v: number) => void;
  colors: ReturnType<typeof useColors>;
}) {
  const LEVELS = [1, 2, 3, 4, 5];
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {LEVELS.map((n) => (
          <TouchableOpacity
            key={n}
            onPress={() => {
              Haptics.selectionAsync();
              onChange(n);
            }}
            style={[
              styles.energyDot,
              {
                backgroundColor: n <= value ? colors.primary : colors.muted,
                borderColor: n <= value ? colors.primary : colors.border,
                transform: [{ scale: n === value ? 1.15 : 1 }],
              },
            ]}
          />
        ))}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={[styles.sliderLabel, { color: colors.mutedForeground }]}>Burned out</Text>
        <Text style={[styles.sliderLabel, { color: colors.mutedForeground }]}>
          {value}/5
        </Text>
        <Text style={[styles.sliderLabel, { color: colors.mutedForeground }]}>Unstoppable</Text>
      </View>
    </View>
  );
}

// ── Outreach fetch ─────────────────────────────────────────────────────────
interface OutreachProductRow {
  productId: number | null;
  productName: string | null;
  emailsSent: number;
  linkedinActions: number;
}
interface OutreachSummary {
  date: string;
  byProduct: OutreachProductRow[];
  totals: { emailsSent: number; linkedinActions: number };
}

function outreachToWentWell(data: OutreachSummary): string {
  const { totals, byProduct } = data;
  if (totals.emailsSent === 0 && totals.linkedinActions === 0) return '';
  const parts: string[] = [];
  if (totals.emailsSent > 0) {
    const productLines = byProduct
      .filter((r) => r.emailsSent > 0)
      .map((r) => `${r.emailsSent} to ${r.productName ?? 'unassigned'}`);
    if (productLines.length > 1) {
      parts.push(`Sent ${totals.emailsSent} emails (${productLines.join(', ')})`);
    } else {
      parts.push(`Sent ${totals.emailsSent} email${totals.emailsSent !== 1 ? 's' : ''}`);
    }
  }
  if (totals.linkedinActions > 0) {
    parts.push(`${totals.linkedinActions} LinkedIn action${totals.linkedinActions !== 1 ? 's' : ''}`);
  }
  return parts.join('. ') + '.';
}

// ── Daily Reflection Sheet ─────────────────────────────────────────────────
function DailyReflectionSheet({
  visible,
  onClose,
  colors,
  insets,
  onSaved,
}: {
  visible: boolean;
  onClose: () => void;
  colors: ReturnType<typeof useColors>;
  insets: { bottom: number; top: number };
  onSaved: () => void;
}) {
  const [exercise, setExercise] = useState('');
  const [energy, setEnergy] = useState(3);
  const [wentWell, setWentWell] = useState('');
  const [wentWrong, setWentWrong] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [outreachLoading, setOutreachLoading] = useState(false);
  const prefilled = useRef(false);

  const today = todayStr();

  // Fetch outreach when sheet opens and pre-fill "went well"
  useEffect(() => {
    if (!visible) {
      // reset on close
      setExercise('');
      setEnergy(3);
      setWentWell('');
      setWentWrong('');
      setFeedback(null);
      prefilled.current = false;
      return;
    }
    if (prefilled.current) return;
    setOutreachLoading(true);
    customFetch<OutreachSummary>(`/api/outreach/today?date=${today}`)
      .then((data) => {
        const prefill = outreachToWentWell(data);
        if (prefill && wentWell.trim() === '') {
          setWentWell(prefill);
          prefilled.current = true;
        }
      })
      .catch(() => {})
      .finally(() => setOutreachLoading(false));
  }, [visible]);

  const handleSubmit = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSubmitting(true);
    try {
      const result = await customFetch<{ coachFeedback?: string | null }>('/api/reflections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: today,
          exercise: exercise.trim() || null,
          energy,
          wentWell: wentWell.trim() || undefined,
          wentWrong: wentWrong.trim() || undefined,
        }),
      });
      if (result.coachFeedback) {
        setFeedback(result.coachFeedback);
      } else {
        onSaved();
        onClose();
      }
    } catch {
      // swallow — user can retry
    } finally {
      setSubmitting(false);
    }
  };

  const handleDismissVerdict = () => {
    onSaved();
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: colors.background }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Header bar */}
        <View
          style={[
            styles.sheetHeader,
            {
              borderBottomColor: colors.border,
              paddingTop: Platform.OS === 'ios' ? 16 : insets.top + 16,
            },
          ]}
        >
          <TouchableOpacity onPress={onClose} style={styles.sheetCancel}>
            <Text style={[styles.sheetCancelText, { color: colors.mutedForeground }]}>
              Cancel
            </Text>
          </TouchableOpacity>
          <Text style={[styles.sheetTitle, { color: colors.foreground }]}>
            Daily Reflection
          </Text>
          <View style={{ width: 64 }} />
        </View>

        <ScrollView
          contentContainerStyle={[
            styles.sheetBody,
            { paddingBottom: insets.bottom + 32 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {feedback ? (
            /* ── Verdict screen ── */
            <View style={styles.verdictWrap}>
              <View
                style={[
                  styles.verdictCard,
                  { backgroundColor: colors.card, borderColor: colors.primary + '33' },
                ]}
              >
                <Text style={[styles.verdictLabel, { color: colors.primary }]}>
                  THE VERDICT
                </Text>
                <Text style={[styles.verdictText, { color: colors.foreground }]}>
                  "{feedback}"
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.submitBtn, { backgroundColor: colors.primary }]}
                onPress={handleDismissVerdict}
                activeOpacity={0.85}
              >
                <Text style={[styles.submitText, { color: '#fff' }]}>Message Received</Text>
              </TouchableOpacity>
            </View>
          ) : (
            /* ── Form ── */
            <View style={{ gap: 24 }}>
              {/* Exercise */}
              <View style={{ gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Feather name="zap" size={13} color={colors.success} />
                  <Text style={[styles.fieldLabel, { color: colors.foreground }]}>
                    Exercise today
                  </Text>
                </View>
                <TextInput
                  style={[
                    styles.textArea,
                    {
                      backgroundColor: colors.card,
                      borderColor: colors.border,
                      color: colors.foreground,
                    },
                  ]}
                  placeholder="e.g. 45-min weights, 5km run… Be specific — vague gets called out."
                  placeholderTextColor={colors.mutedForeground}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                  value={exercise}
                  onChangeText={setExercise}
                />
                <Text style={[styles.fieldHint, { color: colors.mutedForeground }]}>
                  Leave blank and the coach will notice.
                </Text>
              </View>

              {/* Energy */}
              <View style={{ gap: 8 }}>
                <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Energy (1–5)</Text>
                <EnergySlider value={energy} onChange={setEnergy} colors={colors} />
              </View>

              {/* What went well */}
              <View style={{ gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={[styles.fieldLabel, { color: colors.foreground }]}>
                    What went well?
                  </Text>
                  {outreachLoading && (
                    <ActivityIndicator size="small" color={colors.primary} />
                  )}
                  {!outreachLoading && prefilled.current && (
                    <Text style={[styles.prefillBadge, { color: colors.primary }]}>
                      pre-filled from today's sends
                    </Text>
                  )}
                </View>
                <TextInput
                  style={[
                    styles.textArea,
                    {
                      backgroundColor: colors.card,
                      borderColor: colors.border,
                      color: colors.foreground,
                    },
                  ]}
                  placeholder="Wins, momentum, revenue…"
                  placeholderTextColor={colors.mutedForeground}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                  value={wentWell}
                  onChangeText={setWentWell}
                />
              </View>

              {/* What went wrong */}
              <View style={{ gap: 8 }}>
                <Text style={[styles.fieldLabel, { color: colors.foreground }]}>
                  What slowed you down?
                </Text>
                <TextInput
                  style={[
                    styles.textArea,
                    {
                      backgroundColor: colors.card,
                      borderColor: colors.border,
                      color: colors.foreground,
                    },
                  ]}
                  placeholder="Distractions, technical debt, fear…"
                  placeholderTextColor={colors.mutedForeground}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                  value={wentWrong}
                  onChangeText={setWentWrong}
                />
              </View>

              {/* Submit */}
              <TouchableOpacity
                style={[
                  styles.submitBtn,
                  {
                    backgroundColor: submitting ? colors.muted : colors.primary,
                    opacity: submitting ? 0.7 : 1,
                  },
                ]}
                onPress={handleSubmit}
                disabled={submitting}
                activeOpacity={0.85}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={[styles.submitText, { color: '#fff' }]}>
                    Submit Reflection
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Today Screen ───────────────────────────────────────────────────────────
export default function TodayScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [reflectionOpen, setReflectionOpen] = useState(false);

  const date = todayStr();

  const summaryQ = useGetTodaySummary({ date });
  const activitiesQ = useListActivities({ date });
  const dueReviewsQ = useListDueReviews();
  const reflectionsQ = useListReflections();
  const updateActivity = useUpdateActivity();

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: summaryQ.queryKey }),
      queryClient.invalidateQueries({ queryKey: activitiesQ.queryKey }),
      queryClient.invalidateQueries({ queryKey: dueReviewsQ.queryKey }),
    ]);
    setRefreshing(false);
  }, [queryClient, summaryQ.queryKey, activitiesQ.queryKey, dueReviewsQ.queryKey]);

  const handleToggle = (item: Activity) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const next = item.status === 'done' ? ('pending' as ActivityStatus) : ('done' as ActivityStatus);
    updateActivity.mutate({ id: item.id, data: { status: next } });
  };

  const handleReflectionSaved = () => {
    queryClient.invalidateQueries({ queryKey: reflectionsQ.queryKey });
  };

  const isLoading = summaryQ.isLoading && activitiesQ.isLoading;
  const summary = summaryQ.data;
  const activities = activitiesQ.data ?? [];
  const dueReviews = dueReviewsQ.data ?? [];

  // Check if today's reflection already exists
  const todayReflection = (reflectionsQ.data ?? []).find((r) => r.date === date);
  const hasReflection = !!todayReflection;

  const topInset = Platform.OS === 'web' ? 67 : insets.top;

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
      style={[styles.root, { backgroundColor: colors.background }]}
      contentContainerStyle={[
        styles.content,
        { paddingTop: topInset + 16, paddingBottom: insets.bottom + 40 },
      ]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.primary}
        />
      }
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.dateText, { color: colors.foreground }]}>
          {format(new Date(), 'EEEE, MMM d')}
        </Text>
        {summary?.coachPush ? (
          <Text style={[styles.coachPush, { color: colors.mutedForeground }]} numberOfLines={2}>
            "{summary.coachPush}"
          </Text>
        ) : null}
      </View>

      {/* Focus Guard */}
      {summary?.focusGuard && (
        <View
          style={[
            styles.focusCard,
            {
              backgroundColor: colors.card,
              borderColor:
                summary.focusGuard.status === 'on_track'
                  ? colors.success
                  : summary.focusGuard.status === 'warning'
                  ? colors.warn
                  : colors.destructive,
            },
          ]}
        >
          <View style={styles.focusRow}>
            <Text style={[styles.focusLabel, { color: colors.mutedForeground }]}>Focus Guard</Text>
            <View
              style={[
                styles.focusBadge,
                {
                  backgroundColor:
                    summary.focusGuard.status === 'on_track'
                      ? colors.success + '22'
                      : summary.focusGuard.status === 'warning'
                      ? colors.warn + '22'
                      : colors.destructive + '22',
                },
              ]}
            >
              <Text
                style={[
                  styles.focusBadgeText,
                  {
                    color:
                      summary.focusGuard.status === 'on_track'
                        ? colors.success
                        : summary.focusGuard.status === 'warning'
                        ? colors.warn
                        : colors.destructive,
                  },
                ]}
              >
                {summary.focusGuard.status === 'on_track'
                  ? 'On Track'
                  : summary.focusGuard.status === 'warning'
                  ? 'Warning'
                  : 'Drift'}
              </Text>
            </View>
          </View>
          <View style={styles.focusBarBg}>
            <View
              style={[
                styles.focusBarFill,
                {
                  width: `${Math.min(summary.focusGuard.sellCxPct, 100)}%` as any,
                  backgroundColor:
                    summary.focusGuard.status === 'on_track' ? colors.success : colors.warn,
                },
              ]}
            />
          </View>
          <Text style={[styles.focusStat, { color: colors.mutedForeground }]}>
            {Math.round(summary.focusGuard.sellCxPct)}% Sell+CX ·{' '}
            {summary.focusGuard.sellCxMinutes}m
          </Text>
        </View>
      )}

      {/* Due Reviews */}
      {dueReviews.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Feather name="bell" size={14} color={colors.warn} />
            <Text style={[styles.sectionTitle, { color: colors.warn }]}>
              Reviews Due ({dueReviews.length})
            </Text>
          </View>
          {dueReviews.map((r) => (
            <View
              key={r.id}
              style={[
                styles.reviewCard,
                { backgroundColor: colors.card, borderColor: colors.warn + '44' },
              ]}
            >
              <View style={styles.reviewRow}>
                <Text style={[styles.reviewContact, { color: colors.foreground }]}>
                  {r.contactName}
                </Text>
                <Text style={[styles.reviewValue, { color: colors.primary }]}>
                  ${Number(r.value).toLocaleString()}
                </Text>
              </View>
              <View style={styles.reviewMeta}>
                <Text style={[styles.reviewProduct, { color: colors.mutedForeground }]}>
                  {r.productName}
                </Text>
                <View style={[styles.stageBadge, { backgroundColor: colors.muted }]}>
                  <Text style={[styles.stageText, { color: colors.mutedForeground }]}>
                    {r.stage.replace('_', ' ')}
                  </Text>
                </View>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Activities */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Feather name="zap" size={14} color={colors.primary} />
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            Today's Activities
            {summary
              ? `  ${summary.counts.done}/${summary.counts.planned}`
              : ''}
          </Text>
        </View>

        {isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 32 }} />
        ) : activities.length === 0 ? (
          <View style={[styles.emptyState, { borderColor: colors.border }]}>
            <Feather name="inbox" size={32} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              No activities yet
            </Text>
            <Text style={[styles.emptySubText, { color: colors.mutedForeground }]}>
              Add activities from the web app or use AI generation.
            </Text>
          </View>
        ) : (
          activities.map((act) => (
            <ActivityRow
              key={act.id}
              item={act}
              onToggle={handleToggle}
              colors={colors}
            />
          ))
        )}
      </View>

      {/* Daily Reflection button */}
      <TouchableOpacity
        style={[
          styles.reflectionBtn,
          {
            borderColor: hasReflection ? colors.success + '66' : colors.border,
            backgroundColor: hasReflection ? colors.success + '11' : colors.card,
          },
        ]}
        onPress={() => setReflectionOpen(true)}
        activeOpacity={0.75}
      >
        <Feather
          name={hasReflection ? 'check-circle' : 'moon'}
          size={18}
          color={hasReflection ? colors.success : colors.mutedForeground}
        />
        <Text
          style={[
            styles.reflectionBtnText,
            { color: hasReflection ? colors.success : colors.foreground },
          ]}
        >
          {hasReflection ? 'Reflection Done ✓' : 'Daily Reflection'}
        </Text>
        {!hasReflection && (
          <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
        )}
      </TouchableOpacity>
      </ScrollView>

      <DailyReflectionSheet
        visible={reflectionOpen}
        onClose={() => setReflectionOpen(false)}
        colors={colors}
        insets={insets}
        onSaved={handleReflectionSaved}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 16, gap: 4 },
  header: { marginBottom: 16 },
  dateText: {
    fontSize: 24,
    fontWeight: '700' as const,
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.5,
  },
  coachPush: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    marginTop: 6,
    fontStyle: 'italic',
    lineHeight: 18,
  },
  focusCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 16,
    gap: 8,
  },
  focusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  focusLabel: { fontSize: 12, fontFamily: 'Inter_500Medium', fontWeight: '500' as const },
  focusBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  focusBadgeText: { fontSize: 11, fontFamily: 'Inter_600SemiBold', fontWeight: '600' as const },
  focusBarBg: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  focusBarFill: { height: 4, borderRadius: 2 },
  focusStat: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  section: { gap: 8, marginBottom: 8 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 0.2,
  },
  reviewCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 6,
  },
  reviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  reviewContact: { fontSize: 14, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold' },
  reviewValue: { fontSize: 14, fontWeight: '700' as const, fontFamily: 'Inter_700Bold' },
  reviewMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  reviewProduct: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  stageBadge: {
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  stageText: { fontSize: 10, fontWeight: '500' as const, fontFamily: 'Inter_500Medium' },
  actRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 10,
  },
  actIcon: { marginTop: 1 },
  actBody: { flex: 1, gap: 6 },
  actTitle: { fontSize: 14, fontFamily: 'Inter_400Regular', lineHeight: 20 },
  actTitleDone: { textDecorationLine: 'line-through' },
  actMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  catBadge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  catText: { fontSize: 10, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold' },
  effortText: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  emptyState: {
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: 'dashed',
    padding: 32,
    alignItems: 'center',
    gap: 8,
  },
  emptyText: { fontSize: 15, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold' },
  emptySubText: { fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center' },

  // Reflection button
  reflectionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 16,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    padding: 16,
    marginTop: 20,
    marginBottom: 8,
  },
  reflectionBtnText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
  },

  // Sheet
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sheetCancel: { width: 64 },
  sheetCancelText: { fontSize: 16 },
  sheetTitle: {
    fontSize: 17,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
  },
  sheetBody: {
    paddingHorizontal: 20,
    paddingTop: 24,
  },

  // Form fields
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
  },
  fieldHint: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
  },
  prefillBadge: {
    fontSize: 10,
    fontFamily: 'Inter_400Regular',
  },
  textArea: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    minHeight: 80,
    lineHeight: 20,
  },

  // Energy slider
  energyDot: {
    flex: 1,
    height: 32,
    borderRadius: 8,
    borderWidth: 1.5,
  },
  sliderLabel: {
    fontSize: 10,
    fontFamily: 'Inter_400Regular',
  },

  // Submit
  submitBtn: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  submitText: {
    fontSize: 16,
    fontWeight: '700' as const,
    fontFamily: 'Inter_700Bold',
  },

  // Verdict
  verdictWrap: { gap: 24 },
  verdictCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
    gap: 16,
    alignItems: 'center',
  },
  verdictLabel: {
    fontSize: 10,
    fontWeight: '700' as const,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  verdictText: {
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    lineHeight: 24,
    textAlign: 'center',
    fontStyle: 'italic',
  },
});
