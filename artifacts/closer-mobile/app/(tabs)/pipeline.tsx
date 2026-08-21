import React, { useState, useCallback } from 'react';
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
  KeyboardAvoidingView,
  TextInput,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { format, parseISO, isPast, isToday } from 'date-fns';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import {
  useListProducts,
  useListPipelineDeals,
  useCreatePipelineDeal,
  PipelineDeal,
  PipelineStage,
} from '@workspace/api-client-react';

type Stage = PipelineDeal['stage'];

const STAGE_ORDER: Stage[] = [
  'prospect',
  'qualified',
  'proposal',
  'negotiation',
  'closed_won',
  'closed_lost',
];

const STAGE_LABELS: Record<Stage, string> = {
  prospect: 'Prospect',
  qualified: 'Qualified',
  proposal: 'Proposal',
  negotiation: 'Negotiation',
  closed_won: 'Won',
  closed_lost: 'Lost',
};

const STAGE_COLORS: Record<Stage, string> = {
  prospect: '#9AA6BF',
  qualified: '#7C8CFF',
  proposal: '#F2B441',
  negotiation: '#4DD4C1',
  closed_won: '#3FD07A',
  closed_lost: '#F0554E',
};

function DealCard({
  deal,
  colors,
}: {
  deal: PipelineDeal;
  colors: ReturnType<typeof useColors>;
}) {
  const stageColor = STAGE_COLORS[deal.stage] ?? colors.mutedForeground;

  const reviewStatus: 'overdue' | 'today' | 'upcoming' | null = deal.nextReviewDate
    ? isPast(parseISO(deal.nextReviewDate)) && !isToday(parseISO(deal.nextReviewDate))
      ? 'overdue'
      : isToday(parseISO(deal.nextReviewDate))
      ? 'today'
      : 'upcoming'
    : null;

  const reviewColor =
    reviewStatus === 'overdue'
      ? colors.destructive
      : reviewStatus === 'today'
      ? colors.warn
      : colors.mutedForeground;

  return (
    <View style={[styles.dealCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.dealTop}>
        <View style={styles.dealTitle}>
          <Text style={[styles.dealContact, { color: colors.foreground }]} numberOfLines={1}>
            {deal.contactName}
          </Text>
          {deal.companyName ? (
            <Text style={[styles.dealCompany, { color: colors.mutedForeground }]} numberOfLines={1}>
              {deal.companyName}
            </Text>
          ) : null}
        </View>
        <View style={styles.dealRight}>
          <Text style={[styles.dealValue, { color: colors.primary }]}>
            ${Number(deal.value).toLocaleString()}
          </Text>
          <Text style={[styles.dealProb, { color: colors.mutedForeground }]}>
            {deal.probability}%
          </Text>
        </View>
      </View>

      <View style={styles.dealMeta}>
        <View style={[styles.stagePill, { backgroundColor: stageColor + '22' }]}>
          <Text style={[styles.stageLabel, { color: stageColor }]}>
            {STAGE_LABELS[deal.stage]}
          </Text>
        </View>

        {deal.nextReviewDate ? (
          <View style={styles.reviewRow}>
            <Feather
              name={reviewStatus === 'overdue' ? 'alert-circle' : 'calendar'}
              size={11}
              color={reviewColor}
            />
            <Text style={[styles.reviewDate, { color: reviewColor }]}>
              {reviewStatus === 'overdue'
                ? `Overdue: ${format(parseISO(deal.nextReviewDate), 'MMM d')}`
                : reviewStatus === 'today'
                ? 'Review today'
                : `Review ${format(parseISO(deal.nextReviewDate), 'MMM d')}`}
            </Text>
          </View>
        ) : null}
      </View>

      {deal.notes ? (
        <Text style={[styles.dealNotes, { color: colors.mutedForeground }]} numberOfLines={2}>
          {deal.notes}
        </Text>
      ) : null}
    </View>
  );
}

function StageGroup({
  stage,
  deals,
  colors,
}: {
  stage: Stage;
  deals: PipelineDeal[];
  colors: ReturnType<typeof useColors>;
}) {
  const [expanded, setExpanded] = useState(true);
  const stageColor = STAGE_COLORS[stage] ?? colors.mutedForeground;
  const totalValue = deals.reduce((s, d) => s + Number(d.value), 0);

  if (deals.length === 0) return null;

  return (
    <View style={styles.stageGroup}>
      <TouchableOpacity
        style={styles.stageHeader}
        onPress={() => {
          Haptics.selectionAsync();
          setExpanded((e) => !e);
        }}
        activeOpacity={0.7}
      >
        <View style={[styles.stageHeaderDot, { backgroundColor: stageColor }]} />
        <Text style={[styles.stageHeaderLabel, { color: colors.foreground }]}>
          {STAGE_LABELS[stage]}
        </Text>
        <Text style={[styles.stageHeaderCount, { color: colors.mutedForeground }]}>
          {deals.length} · ${totalValue.toLocaleString()}
        </Text>
        <Feather
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={colors.mutedForeground}
        />
      </TouchableOpacity>

      {expanded &&
        deals.map((d) => <DealCard key={d.id} deal={d} colors={colors} />)}
    </View>
  );
}

// ─── Add Deal Modal ─────────────────────────────────────────────────────────

interface DealForm {
  contactName: string;
  companyName: string;
  value: string;
  stage: Stage;
  nextReviewDate: Date | null;
}

const EMPTY_FORM: DealForm = {
  contactName: '',
  companyName: '',
  value: '',
  stage: 'prospect',
  nextReviewDate: null,
};

function AddDealModal({
  visible,
  productId,
  colors,
  insets,
  onClose,
  onCreated,
}: {
  visible: boolean;
  productId: number;
  colors: ReturnType<typeof useColors>;
  insets: { top: number; bottom: number };
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState<DealForm>(EMPTY_FORM);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const createDeal = useCreatePipelineDeal();

  const saving = createDeal.isPending;

  const handleClose = useCallback(() => {
    setForm(EMPTY_FORM);
    setShowDatePicker(false);
    onClose();
  }, [onClose]);

  const handleSave = useCallback(async () => {
    if (!form.contactName.trim()) {
      Alert.alert('Name required', 'Please enter a contact name.');
      return;
    }
    const valueNum = form.value.trim() ? parseFloat(form.value.replace(/,/g, '')) : undefined;
    if (form.value.trim() && (isNaN(valueNum!) || valueNum! < 0)) {
      Alert.alert('Invalid value', 'Please enter a valid deal value.');
      return;
    }
    try {
      await createDeal.mutateAsync({
        data: {
          productId,
          contactName: form.contactName.trim(),
          companyName: form.companyName.trim() || undefined,
          value: valueNum,
          stage: form.stage as PipelineStage,
          nextReviewDate: form.nextReviewDate
            ? format(form.nextReviewDate, 'yyyy-MM-dd')
            : undefined,
        },
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setForm(EMPTY_FORM);
      setShowDatePicker(false);
      onCreated();
    } catch {
      Alert.alert('Error', 'Failed to save deal. Please try again.');
    }
  }, [form, productId, createDeal, onCreated]);

  const handleDateChange = useCallback(
    (event: DateTimePickerEvent, selected?: Date) => {
      if (Platform.OS === 'android') {
        setShowDatePicker(false);
        if (event.type === 'dismissed' || !selected) return;
      }
      if (selected) {
        setForm((f) => ({ ...f, nextReviewDate: selected }));
      }
    },
    [],
  );

  const inputStyle = [
    addDealStyles.input,
    { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground },
  ];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        style={[addDealStyles.root, { backgroundColor: colors.background }]}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Header */}
        <View
          style={[
            addDealStyles.header,
            { borderBottomColor: colors.border, paddingTop: insets.top + 16 },
          ]}
        >
          <TouchableOpacity onPress={handleClose} hitSlop={8} style={addDealStyles.headerSide}>
            <Text style={[addDealStyles.cancelText, { color: colors.mutedForeground }]}>
              Cancel
            </Text>
          </TouchableOpacity>
          <Text style={[addDealStyles.headerTitle, { color: colors.foreground }]}>Add Deal</Text>
          <TouchableOpacity
            onPress={handleSave}
            hitSlop={8}
            disabled={saving}
            style={addDealStyles.headerSide}
          >
            {saving ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Text style={[addDealStyles.saveText, { color: colors.primary }]}>Save</Text>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView
          style={addDealStyles.scroll}
          contentContainerStyle={[
            addDealStyles.content,
            { paddingBottom: insets.bottom + 32 },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Contact name */}
          <Text style={[addDealStyles.label, { color: colors.mutedForeground }]}>CONTACT NAME</Text>
          <TextInput
            style={inputStyle}
            placeholder="Full name"
            placeholderTextColor={colors.mutedForeground}
            autoCapitalize="words"
            autoCorrect={false}
            value={form.contactName}
            onChangeText={(v) => setForm((f) => ({ ...f, contactName: v }))}
          />

          {/* Company */}
          <Text style={[addDealStyles.label, { color: colors.mutedForeground }]}>
            COMPANY
          </Text>
          <TextInput
            style={inputStyle}
            placeholder="Company name (optional)"
            placeholderTextColor={colors.mutedForeground}
            autoCapitalize="words"
            autoCorrect={false}
            value={form.companyName}
            onChangeText={(v) => setForm((f) => ({ ...f, companyName: v }))}
          />

          {/* Value */}
          <Text style={[addDealStyles.label, { color: colors.mutedForeground }]}>VALUE (USD)</Text>
          <TextInput
            style={inputStyle}
            placeholder="0"
            placeholderTextColor={colors.mutedForeground}
            keyboardType="decimal-pad"
            value={form.value}
            onChangeText={(v) => setForm((f) => ({ ...f, value: v }))}
          />

          {/* Stage */}
          <Text style={[addDealStyles.label, { color: colors.mutedForeground }]}>STAGE</Text>
          <View style={addDealStyles.stageGrid}>
            {STAGE_ORDER.map((s) => {
              const active = form.stage === s;
              const color = STAGE_COLORS[s];
              return (
                <TouchableOpacity
                  key={s}
                  style={[
                    addDealStyles.stageChip,
                    {
                      backgroundColor: active ? color + '22' : colors.card,
                      borderColor: active ? color : colors.border,
                    },
                  ]}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setForm((f) => ({ ...f, stage: s }));
                  }}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      addDealStyles.stageChipText,
                      { color: active ? color : colors.mutedForeground },
                    ]}
                  >
                    {STAGE_LABELS[s]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Next review date */}
          <Text style={[addDealStyles.label, { color: colors.mutedForeground }]}>
            NEXT REVIEW DATE
          </Text>
          <TouchableOpacity
            style={[
              inputStyle,
              addDealStyles.dateButton,
            ]}
            onPress={() => {
              Haptics.selectionAsync();
              if (!form.nextReviewDate) {
                setForm((f) => ({ ...f, nextReviewDate: new Date() }));
              }
              setShowDatePicker(true);
            }}
            activeOpacity={0.7}
          >
            <Feather name="calendar" size={14} color={colors.mutedForeground} />
            <Text
              style={[
                addDealStyles.dateText,
                {
                  color: form.nextReviewDate
                    ? colors.foreground
                    : colors.mutedForeground,
                },
              ]}
            >
              {form.nextReviewDate
                ? format(form.nextReviewDate, 'MMM d, yyyy')
                : 'No date set'}
            </Text>
            {form.nextReviewDate ? (
              <TouchableOpacity
                onPress={(e) => {
                  e.stopPropagation();
                  setForm((f) => ({ ...f, nextReviewDate: null }));
                  setShowDatePicker(false);
                }}
                hitSlop={8}
              >
                <Feather name="x" size={14} color={colors.mutedForeground} />
              </TouchableOpacity>
            ) : null}
          </TouchableOpacity>

          {/* iOS inline date picker */}
          {showDatePicker && Platform.OS === 'ios' && (
            <DateTimePicker
              value={form.nextReviewDate ?? new Date()}
              mode="date"
              display="inline"
              onChange={handleDateChange}
              minimumDate={new Date()}
              style={{ alignSelf: 'stretch' }}
            />
          )}

          {/* Android modal date picker */}
          {showDatePicker && Platform.OS === 'android' && (
            <DateTimePicker
              value={form.nextReviewDate ?? new Date()}
              mode="date"
              display="default"
              onChange={handleDateChange}
              minimumDate={new Date()}
            />
          )}

          {/* Save button */}
          <TouchableOpacity
            style={[
              addDealStyles.saveBtn,
              { backgroundColor: saving ? colors.muted : colors.primary },
            ]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.8}
          >
            {saving ? (
              <ActivityIndicator size="small" color={colors.primaryForeground} />
            ) : (
              <>
                <Feather name="plus-circle" size={16} color={colors.primaryForeground} />
                <Text style={[addDealStyles.saveBtnText, { color: colors.primaryForeground }]}>
                  Add Deal
                </Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Pipeline Screen ─────────────────────────────────────────────────────────

export default function PipelineScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [addDealVisible, setAddDealVisible] = useState(false);

  const productsQ = useListProducts();
  const products = productsQ.data ?? [];

  // Default to first product
  const activeProductId = selectedProductId ?? products[0]?.id ?? null;

  // Always call the hook (rules of hooks); guard by checking activeProductId before using data
  const dealsQ = useListPipelineDeals({ productId: activeProductId ?? 0 });
  const deals = activeProductId ? (dealsQ.data ?? []) : [];

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: productsQ.queryKey }),
      ...(activeProductId !== null
        ? [queryClient.invalidateQueries({ queryKey: dealsQ.queryKey })]
        : []),
    ]);
    setRefreshing(false);
  }, [queryClient, productsQ.queryKey, dealsQ.queryKey, activeProductId]);

  const handleDealCreated = useCallback(() => {
    setAddDealVisible(false);
    if (activeProductId !== null) {
      queryClient.invalidateQueries({ queryKey: dealsQ.queryKey });
    }
  }, [queryClient, dealsQ.queryKey, activeProductId]);

  const byStage = STAGE_ORDER.reduce<Record<Stage, PipelineDeal[]>>(
    (acc, s) => ({ ...acc, [s]: deals.filter((d) => d.stage === s) }),
    {} as Record<Stage, PipelineDeal[]>
  );

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
      {/* Title row with "+" button */}
      <View style={styles.titleRow}>
        <Text style={[styles.screenTitle, { color: colors.foreground }]}>Pipeline</Text>
        {activeProductId !== null && (
          <TouchableOpacity
            style={[styles.addButton, { backgroundColor: colors.primary }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setAddDealVisible(true);
            }}
            activeOpacity={0.8}
            hitSlop={8}
          >
            <Feather name="plus" size={18} color={colors.primaryForeground} />
          </TouchableOpacity>
        )}
      </View>

      {/* Product selector */}
      {products.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.productScroll}
          contentContainerStyle={styles.productScrollContent}
        >
          {products.map((p) => {
            const isActive = p.id === activeProductId;
            return (
              <TouchableOpacity
                key={p.id}
                style={[
                  styles.productChip,
                  {
                    backgroundColor: isActive ? colors.primary : colors.secondary,
                    borderColor: isActive ? colors.primary : colors.border,
                  },
                ]}
                onPress={() => {
                  Haptics.selectionAsync();
                  setSelectedProductId(p.id);
                }}
                activeOpacity={0.75}
              >
                <Text
                  style={[
                    styles.productChipText,
                    { color: isActive ? colors.primaryForeground : colors.mutedForeground },
                  ]}
                >
                  {p.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* Pipeline summary */}
      {deals.length > 0 && (
        <View style={[styles.summaryRow]}>
          <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.summaryValue, { color: colors.foreground }]}>
              {deals.length}
            </Text>
            <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Deals</Text>
          </View>
          <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.summaryValue, { color: colors.primary }]}>
              ${deals
                .filter((d) => !['closed_lost'].includes(d.stage))
                .reduce((s, d) => s + Number(d.value), 0)
                .toLocaleString()}
            </Text>
            <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Pipeline</Text>
          </View>
          <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.summaryValue, { color: colors.success }]}>
              ${deals
                .filter((d) => d.stage === 'closed_won')
                .reduce((s, d) => s + Number(d.value), 0)
                .toLocaleString()}
            </Text>
            <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Won</Text>
          </View>
        </View>
      )}

      {/* Deals */}
      {productsQ.isLoading || dealsQ.isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 48 }} />
      ) : products.length === 0 ? (
        <View style={[styles.emptyState, { borderColor: colors.border }]}>
          <Feather name="layers" size={36} color={colors.mutedForeground} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No products yet</Text>
          <Text style={[styles.emptySubText, { color: colors.mutedForeground }]}>
            Add a product first from the web app.
          </Text>
        </View>
      ) : deals.length === 0 ? (
        <View style={[styles.emptyState, { borderColor: colors.border }]}>
          <Feather name="bar-chart-2" size={36} color={colors.mutedForeground} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No deals yet</Text>
          <Text style={[styles.emptySubText, { color: colors.mutedForeground }]}>
            Tap the + button above to add your first deal.
          </Text>
        </View>
      ) : (
        STAGE_ORDER.map((stage) => (
          <StageGroup key={stage} stage={stage} deals={byStage[stage]} colors={colors} />
        ))
      )}
      </ScrollView>

      {/* Add Deal Modal */}
      {activeProductId !== null && (
        <AddDealModal
          visible={addDealVisible}
          productId={activeProductId}
          colors={colors}
          insets={{ top: insets.top, bottom: insets.bottom }}
          onClose={() => setAddDealVisible(false)}
          onCreated={handleDealCreated}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 16, gap: 4 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  screenTitle: {
    fontSize: 26,
    fontWeight: '700' as const,
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.5,
  },
  addButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  productScroll: { marginHorizontal: -16, marginBottom: 16 },
  productScrollContent: { paddingHorizontal: 16, gap: 8 },
  productChip: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  productChipText: {
    fontSize: 13,
    fontWeight: '500' as const,
    fontFamily: 'Inter_500Medium',
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  summaryCard: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    alignItems: 'center',
    gap: 2,
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: '700' as const,
    fontFamily: 'Inter_700Bold',
  },
  summaryLabel: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
  },
  stageGroup: { marginBottom: 8 },
  stageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  stageHeaderDot: { width: 8, height: 8, borderRadius: 4 },
  stageHeaderLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
  },
  stageHeaderCount: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  dealCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 8,
    gap: 8,
  },
  dealTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  dealTitle: { flex: 1, gap: 2 },
  dealContact: { fontSize: 14, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold' },
  dealCompany: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  dealRight: { alignItems: 'flex-end', gap: 2 },
  dealValue: { fontSize: 15, fontWeight: '700' as const, fontFamily: 'Inter_700Bold' },
  dealProb: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  dealMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stagePill: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  stageLabel: {
    fontSize: 11,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
  },
  reviewRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  reviewDate: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  dealNotes: { fontSize: 12, fontFamily: 'Inter_400Regular', lineHeight: 17 },
  emptyState: {
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: 'dashed',
    padding: 40,
    alignItems: 'center',
    gap: 10,
    marginTop: 24,
  },
  emptyText: { fontSize: 16, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold' },
  emptySubText: { fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center' },
});

const addDealStyles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  headerSide: { minWidth: 56 },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
  },
  cancelText: { fontSize: 16, fontFamily: 'Inter_400Regular' },
  saveText: { fontSize: 16, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold', textAlign: 'right' },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, gap: 0 },
  label: {
    fontSize: 11,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 0.6,
    marginTop: 20,
    marginBottom: 8,
  },
  input: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
  },
  stageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  stageChip: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  stageChipText: {
    fontSize: 13,
    fontWeight: '500' as const,
    fontFamily: 'Inter_500Medium',
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dateText: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 32,
  },
  saveBtnText: {
    fontSize: 16,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
  },
});
