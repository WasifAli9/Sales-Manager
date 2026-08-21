/**
 * Mobile Social Schedule modal.
 * Shows the monthly content calendar for a product and lets the user
 * generate "This month" or "Next month" — mirroring the web Social tab.
 */
import React, { useState } from 'react';
import {
  ActivityIndicator,
  ActionSheetIOS,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import {
  useSocialPosts,
  useGenerateSchedule,
  useApproveSocialPost,
  useRejectSocialPost,
  useRegenerateSocialPost,
  currentYM,
  addMonth,
  formatMonth,
  daysInMonth,
  firstWeekdayOfMonth,
  type SocialPost,
} from '@/hooks/useSocialPosts';

// ── Status colours ────────────────────────────────────────────────────────────

const STATUS_DOT: Record<string, string> = {
  pending_approval: '#F2B441',
  approved:         '#7C8CFF',
  posted:           '#3FD07A',
  failed:           '#F0554E',
  rejected:         '#9AA6BF',
};

const STATUS_LABEL: Record<string, string> = {
  pending_approval: 'Pending',
  approved:         'Approved',
  posted:           'Posted',
  failed:           'Failed',
  rejected:         'Rejected',
};

// ── Month picker action sheet ─────────────────────────────────────────────────

function showMonthPicker(
  currentMonth: string,
  onSelect: (startDate: string, navigateTo?: string) => void
) {
  const nextMonth = addMonth(currentMonth, 1);
  const thisLabel = `This month — ${formatMonth(currentMonth)}`;
  const nextLabel = `Next month — ${formatMonth(nextMonth)}`;

  if (Platform.OS === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: 'Generate Schedule',
        message: 'Choose which month to generate content for',
        options: [thisLabel, nextLabel, 'Cancel'],
        cancelButtonIndex: 2,
      },
      (idx) => {
        if (idx === 0) onSelect(`${currentMonth}-01`);
        if (idx === 1) onSelect(`${nextMonth}-01`, nextMonth);
      }
    );
  } else {
    // Android — use Alert with buttons (max 3)
    Alert.alert(
      'Generate Schedule',
      'Choose which month to generate content for',
      [
        { text: thisLabel, onPress: () => onSelect(`${currentMonth}-01`) },
        { text: nextLabel, onPress: () => onSelect(`${nextMonth}-01`, nextMonth) },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  }
}

// ── Post action bottom sheet ──────────────────────────────────────────────────

function PostActionSheet({
  post,
  onClose,
  colors,
}: {
  post: SocialPost;
  onClose: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  const insets      = useSafeAreaInsets();
  const approve     = useApproveSocialPost();
  const reject      = useRejectSocialPost();
  const regenerate  = useRegenerateSocialPost();
  const [newTheme, setNewTheme] = useState('');

  const busy     = approve.isPending || reject.isPending || regenerate.isPending;
  const canAct   = post.status !== 'posted';
  const isPending = post.status === 'pending_approval';
  const isApproved = post.status === 'approved';

  const dotColor = STATUS_DOT[post.status] ?? '#9AA6BF';
  const igColor  = '#E1306C';
  const liColor  = '#0A66C2';
  const iconColor = post.platform === 'instagram' ? igColor : liColor;

  const handleApprove = () => {
    approve.mutate(post.id, { onSuccess: onClose });
  };

  const handleReject = () => {
    reject.mutate(post.id, { onSuccess: onClose });
  };

  const handleRegenerate = () => {
    regenerate.mutate({ id: post.id, theme: newTheme || undefined }, {
      onSuccess: onClose,
    });
  };

  return (
    <Modal
      visible
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      {/* Backdrop */}
      <TouchableOpacity
        style={sheetStyles.backdrop}
        activeOpacity={1}
        onPress={onClose}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={sheetStyles.kavWrapper}
        pointerEvents="box-none"
      >
        <View
          style={[
            sheetStyles.sheet,
            { backgroundColor: colors.background, paddingBottom: insets.bottom + 16 },
          ]}
        >
          {/* Handle */}
          <View style={[sheetStyles.handle, { backgroundColor: colors.border }]} />

          {/* Header row */}
          <View style={sheetStyles.headerRow}>
            <View style={sheetStyles.headerLeft}>
              <Feather
                name={post.platform === 'instagram' ? 'instagram' : 'linkedin'}
                size={16}
                color={iconColor}
              />
              <View>
                <Text style={[sheetStyles.platformLabel, { color: colors.foreground }]}>
                  {post.platform === 'instagram' ? 'Instagram' : 'LinkedIn'}
                </Text>
                <Text style={[sheetStyles.dateLabel, { color: colors.mutedForeground }]}>
                  {new Date(post.scheduledDate + 'T00:00:00').toLocaleDateString('en-GB', {
                    weekday: 'short', day: 'numeric', month: 'short',
                  })}
                </Text>
              </View>
            </View>

            <View style={sheetStyles.headerRight}>
              <View style={[sheetStyles.statusBadge, { borderColor: dotColor + '55', backgroundColor: dotColor + '18' }]}>
                <View style={[sheetStyles.statusDot, { backgroundColor: dotColor }]} />
                <Text style={[sheetStyles.statusText, { color: dotColor }]}>
                  {STATUS_LABEL[post.status]}
                </Text>
              </View>
              <TouchableOpacity onPress={onClose} hitSlop={10}>
                <Feather name="x" size={20} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Image preview */}
          {post.imageUrl ? (
            <Image
              source={{ uri: post.imageUrl }}
              style={sheetStyles.imagePreview}
              resizeMode="cover"
            />
          ) : (
            <View style={[sheetStyles.imagePlaceholder, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
              <Feather name="image" size={28} color={colors.mutedForeground} />
              <Text style={[sheetStyles.imagePlaceholderText, { color: colors.mutedForeground }]}>
                {post.status === 'pending_approval' ? 'Generating image…' : 'No image'}
              </Text>
            </View>
          )}

          {/* Theme chip */}
          {post.theme ? (
            <View style={sheetStyles.themeRow}>
              <View style={[sheetStyles.themeChip, { backgroundColor: colors.primary + '18', borderColor: colors.primary + '40' }]}>
                <Feather name="tag" size={10} color={colors.primary} />
                <Text style={[sheetStyles.themeText, { color: colors.primary }]}>{post.theme}</Text>
              </View>
            </View>
          ) : null}

          {/* Caption */}
          {post.caption ? (
            <Text style={[sheetStyles.caption, { color: colors.foreground }]} numberOfLines={3}>
              {post.caption}
            </Text>
          ) : null}
          {post.hashtags ? (
            <Text style={[sheetStyles.hashtags, { color: colors.primary + 'AA' }]} numberOfLines={2}>
              {post.hashtags}
            </Text>
          ) : null}

          {/* Error */}
          {post.errorMessage ? (
            <View style={[sheetStyles.errorBanner, { backgroundColor: '#F0554E18', borderColor: '#F0554E44' }]}>
              <Feather name="alert-circle" size={13} color="#F0554E" />
              <Text style={sheetStyles.errorText}>{post.errorMessage}</Text>
            </View>
          ) : null}

          {/* Actions */}
          {canAct && (
            <View style={sheetStyles.actions}>
              {isPending && (
                <View style={sheetStyles.approveRejectRow}>
                  <TouchableOpacity
                    style={[
                      sheetStyles.actionBtn,
                      { backgroundColor: '#3FD07A22', borderColor: '#3FD07A55' },
                      busy && sheetStyles.disabled,
                    ]}
                    onPress={handleApprove}
                    disabled={busy}
                  >
                    {approve.isPending ? (
                      <ActivityIndicator size="small" color="#3FD07A" />
                    ) : (
                      <Feather name="check-circle" size={15} color="#3FD07A" />
                    )}
                    <Text style={[sheetStyles.actionBtnText, { color: '#3FD07A' }]}>Approve</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      sheetStyles.actionBtn,
                      { backgroundColor: '#F0554E18', borderColor: '#F0554E44' },
                      busy && sheetStyles.disabled,
                    ]}
                    onPress={handleReject}
                    disabled={busy}
                  >
                    {reject.isPending ? (
                      <ActivityIndicator size="small" color="#F0554E" />
                    ) : (
                      <Feather name="x-circle" size={15} color="#F0554E" />
                    )}
                    <Text style={[sheetStyles.actionBtnText, { color: '#F0554E' }]}>Reject</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Regenerate section */}
              <View style={[sheetStyles.regenerateSection, { borderTopColor: colors.border }]}>
                <Text style={[sheetStyles.regenerateHint, { color: colors.mutedForeground }]}>
                  Change topic before regenerating (optional)
                </Text>
                <View style={sheetStyles.regenerateRow}>
                  <TextInput
                    style={[
                      sheetStyles.themeInput,
                      { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground },
                    ]}
                    value={newTheme}
                    onChangeText={setNewTheme}
                    placeholder={post.theme || 'e.g. customer story, tips, pricing…'}
                    placeholderTextColor={colors.mutedForeground + '88'}
                    returnKeyType="done"
                  />
                  <TouchableOpacity
                    style={[
                      sheetStyles.regenerateBtn,
                      { backgroundColor: colors.secondary, borderColor: colors.border },
                      busy && sheetStyles.disabled,
                    ]}
                    onPress={handleRegenerate}
                    disabled={busy}
                  >
                    {regenerate.isPending ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <Feather name="refresh-cw" size={14} color={colors.primary} />
                    )}
                    <Text style={[sheetStyles.regenerateBtnText, { color: colors.primary }]}>
                      Regenerate
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Day cell ──────────────────────────────────────────────────────────────────

function DayCell({
  day,
  dateStr,
  posts,
  colors,
  cellSize,
}: {
  day: number | null;
  dateStr: string | null;
  posts: SocialPost[];
  colors: ReturnType<typeof useColors>;
  cellSize: number;
}) {
  if (!day || !dateStr) {
    return <View style={[styles.dayCell, { width: cellSize, height: cellSize }]} />;
  }

  const today = new Date().toISOString().split('T')[0];
  const isToday = dateStr === today;

  const igPosts = posts.filter((p) => p.platform === 'instagram');
  const liPosts = posts.filter((p) => p.platform === 'linkedin');

  return (
    <View
      style={[
        styles.dayCell,
        { width: cellSize, height: cellSize },
        posts.length > 0 && { backgroundColor: colors.secondary, borderColor: colors.border },
        isToday && { borderColor: colors.primary, backgroundColor: colors.primary + '18' },
        { borderWidth: 1, borderColor: posts.length > 0 || isToday ? undefined : 'transparent' },
      ]}
    >
      <Text
        style={[
          styles.dayNumber,
          { color: isToday ? colors.primary : colors.mutedForeground },
        ]}
      >
        {day}
      </Text>

      {/* Platform dots */}
      {(igPosts.length > 0 || liPosts.length > 0) && (
        <View style={styles.dotsRow}>
          {igPosts.slice(0, 1).map((p) => (
            <View
              key={`ig-${p.id}`}
              style={[styles.dot, { backgroundColor: STATUS_DOT[p.status] }]}
            />
          ))}
          {liPosts.slice(0, 1).map((p) => (
            <View
              key={`li-${p.id}`}
              style={[styles.dot, { backgroundColor: STATUS_DOT[p.status] }]}
            />
          ))}
          {posts.length > 2 && (
            <Text style={[styles.extraDots, { color: colors.mutedForeground }]}>
              +{posts.length - 2}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

// ── Legend ────────────────────────────────────────────────────────────────────

function Legend() {
  return (
    <View style={styles.legendRow}>
      {Object.entries(STATUS_LABEL).map(([s, l]) => (
        <View key={s} style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: STATUS_DOT[s] }]} />
          <Text style={styles.legendText}>{l}</Text>
        </View>
      ))}
    </View>
  );
}

// ── Post list (below calendar) ────────────────────────────────────────────────

function PostList({
  posts,
  colors,
  onSelectPost,
}: {
  posts: SocialPost[];
  colors: ReturnType<typeof useColors>;
  onSelectPost: (post: SocialPost) => void;
}) {
  if (posts.length === 0) return null;

  // Group by date
  const byDate: Record<string, SocialPost[]> = {};
  for (const p of posts) {
    if (!byDate[p.scheduledDate]) byDate[p.scheduledDate] = [];
    byDate[p.scheduledDate].push(p);
  }

  return (
    <View style={styles.postList}>
      {Object.entries(byDate)
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(0, 10)
        .map(([date, dayPosts]) => (
          <View key={date} style={[styles.postGroup, { borderColor: colors.border }]}>
            <Text style={[styles.postDate, { color: colors.mutedForeground }]}>
              {new Date(date + 'T00:00:00').toLocaleDateString('en-GB', {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
              })}
            </Text>
            {dayPosts.map((p) => (
              <TouchableOpacity
                key={p.id}
                style={[styles.postRow, { backgroundColor: colors.secondary }]}
                onPress={() => onSelectPost(p)}
                activeOpacity={0.7}
              >
                <Feather
                  name={p.platform === 'instagram' ? 'instagram' : 'linkedin'}
                  size={13}
                  color={p.platform === 'instagram' ? '#E1306C' : '#0A66C2'}
                />
                <View style={styles.postDot}>
                  <View style={[styles.dot, { backgroundColor: STATUS_DOT[p.status] }]} />
                  <Text style={[styles.postStatus, { color: colors.foreground }]}>
                    {STATUS_LABEL[p.status]}
                  </Text>
                </View>
                {p.caption ? (
                  <Text style={[styles.postCaption, { color: colors.mutedForeground }]} numberOfLines={1}>
                    {p.caption}
                  </Text>
                ) : null}
                <Feather name="chevron-right" size={12} color={colors.mutedForeground + '88'} />
              </TouchableOpacity>
            ))}
          </View>
        ))}
    </View>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  productId: number;
  productName: string;
  visible: boolean;
  onClose: () => void;
}

export function ProductSocialModal({ productId, productName, visible, onClose }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const [month, setMonth] = useState(currentYM);
  const [selectedPost, setSelectedPost] = useState<SocialPost | null>(null);

  // Fluid cell size: fill available width minus scroll padding (2×16) and 6 inter-column gaps (6×3)
  const SCROLL_H_PADDING = 32; // 2 × paddingHorizontal:16
  const GRID_GAPS = 6 * 3;     // 6 gaps of 3px between 7 columns
  const cellSize = Math.min(
    Math.floor((windowWidth - SCROLL_H_PADDING - GRID_GAPS) / 7),
    56, // cap so cells don't grow huge on iPad
  );

  const { data, isLoading } = useSocialPosts(productId, month);
  const generate = useGenerateSchedule(productId);

  const posts = data?.posts ?? [];

  // Build calendar grid
  const totalDays = daysInMonth(month);
  const firstWeekday = firstWeekdayOfMonth(month);
  const byDate: Record<string, SocialPost[]> = {};
  for (const p of posts) {
    if (!byDate[p.scheduledDate]) byDate[p.scheduledDate] = [];
    byDate[p.scheduledDate].push(p);
  }

  const cells: Array<{ day: number | null; dateStr: string | null }> = [];
  for (let i = 0; i < firstWeekday; i++) cells.push({ day: null, dateStr: null });
  for (let d = 1; d <= totalDays; d++) {
    cells.push({ day: d, dateStr: `${month}-${String(d).padStart(2, '0')}` });
  }

  const generating = posts.some((p) => !p.imageUrl && p.status === 'pending_approval');

  const handleGenerate = () => {
    showMonthPicker(month, (startDate, navigateTo) => {
      generate.mutate(startDate, {
        onSuccess: () => {
          if (navigateTo) setMonth(navigateTo);
        },
      });
    });
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        {/* Header */}
        <View
          style={[
            styles.header,
            { borderBottomColor: colors.border, paddingTop: insets.top + 16 },
          ]}
        >
          <View style={styles.headerTitleRow}>
            <Feather name="rss" size={18} color={colors.primary} />
            <Text style={[styles.headerTitle, { color: colors.foreground }]} numberOfLines={1}>
              {productName}
            </Text>
          </View>
          <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>
            Social Schedule
          </Text>

          <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={12}>
            <Feather name="x" size={22} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: insets.bottom + 32 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* Month navigation + generate button */}
          <View style={styles.controls}>
            <View style={styles.monthNav}>
              <TouchableOpacity
                onPress={() => setMonth((m) => addMonth(m, -1))}
                style={[styles.navBtn, { backgroundColor: colors.secondary }]}
                hitSlop={8}
              >
                <Feather name="chevron-left" size={18} color={colors.foreground} />
              </TouchableOpacity>
              <Text style={[styles.monthLabel, { color: colors.foreground }]}>
                {formatMonth(month)}
              </Text>
              <TouchableOpacity
                onPress={() => setMonth((m) => addMonth(m, 1))}
                style={[styles.navBtn, { backgroundColor: colors.secondary }]}
                hitSlop={8}
              >
                <Feather name="chevron-right" size={18} color={colors.foreground} />
              </TouchableOpacity>
            </View>

            {/* Generate Schedule button */}
            <TouchableOpacity
              style={[
                styles.generateBtn,
                { backgroundColor: colors.primary + '22', borderColor: colors.primary + '55' },
                generate.isPending && { opacity: 0.6 },
              ]}
              onPress={handleGenerate}
              disabled={generate.isPending}
            >
              {generate.isPending ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Feather name="zap" size={15} color={colors.primary} />
              )}
              <Text style={[styles.generateBtnText, { color: colors.primary }]}>
                {generate.isPending ? 'Generating…' : 'Generate Schedule'}
              </Text>
              {!generate.isPending && (
                <Feather name="chevron-down" size={14} color={colors.primary} />
              )}
            </TouchableOpacity>
          </View>

          {/* Generating notice */}
          {generating && (
            <View
              style={[
                styles.generatingBanner,
                { backgroundColor: colors.primary + '14', borderColor: colors.primary + '40' },
              ]}
            >
              <Feather name="zap" size={14} color={colors.primary} />
              <Text style={[styles.generatingText, { color: colors.primary }]}>
                Generating AI images in the background…
              </Text>
            </View>
          )}

          {/* Loading skeleton */}
          {isLoading ? (
            <ActivityIndicator
              color={colors.primary}
              style={{ marginTop: 40 }}
            />
          ) : posts.length === 0 && !generate.isPending ? (
            /* Empty state */
            <View style={styles.emptyState}>
              <Feather name="calendar" size={36} color={colors.mutedForeground} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                No content scheduled
              </Text>
              <Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>
                Tap "Generate Schedule" to let AI create a full month of Instagram and LinkedIn posts.
              </Text>
            </View>
          ) : (
            <>
              {/* Calendar grid */}
              <View style={styles.calendarGrid}>
                {/* Day headers */}
                {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
                  <Text
                    key={d}
                    style={[styles.dayHeader, { width: cellSize, color: colors.mutedForeground }]}
                  >
                    {d}
                  </Text>
                ))}
                {/* Cells */}
                {cells.map((cell, i) => (
                  <DayCell
                    key={cell.dateStr ?? `empty-${i}`}
                    day={cell.day}
                    dateStr={cell.dateStr}
                    posts={cell.dateStr ? (byDate[cell.dateStr] ?? []) : []}
                    colors={colors}
                    cellSize={cellSize}
                  />
                ))}
              </View>

              <Legend />

              {/* Post list */}
              <PostList
                posts={posts}
                colors={colors}
                onSelectPost={setSelectedPost}
              />
            </>
          )}
        </ScrollView>
      </View>

      {/* Post action bottom sheet */}
      {selectedPost && (
        <PostActionSheet
          post={selectedPost}
          onClose={() => setSelectedPost(null)}
          colors={colors}
        />
      )}
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },

  header: {
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    position: 'relative',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
    fontWeight: '700',
    flex: 1,
  },
  headerSub: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
  },
  closeBtn: {
    position: 'absolute',
    right: 20,
    top: 16,
    padding: 4,
  },

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16, gap: 16 },

  controls: { gap: 12 },

  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthLabel: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
    fontWeight: '600',
    minWidth: 160,
    textAlign: 'center',
  },

  generateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 11,
    paddingHorizontal: 18,
    borderRadius: 12,
    borderWidth: 1,
  },
  generateBtnText: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    fontWeight: '600',
  },

  generatingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  generatingText: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    flex: 1,
  },

  emptyState: {
    alignItems: 'center',
    gap: 12,
    marginTop: 48,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
    fontWeight: '600',
  },
  emptyBody: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    lineHeight: 19,
  },

  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 3,
  },
  dayHeader: {
    textAlign: 'center',
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    paddingVertical: 4,
  },
  dayCell: {
    borderRadius: 8,
    padding: 4,
    justifyContent: 'space-between',
  },
  dayNumber: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  extraDots: {
    fontSize: 8,
    fontFamily: 'Inter_400Regular',
  },

  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 10,
    fontFamily: 'Inter_400Regular',
    color: '#9AA6BF',
  },

  postList: { gap: 12 },
  postGroup: { gap: 6 },
  postDate: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    fontWeight: '600',
    marginBottom: 2,
  },
  postRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
  },
  postDot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  postStatus: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
  },
  postCaption: {
    flex: 1,
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
  },
});

// ── Sheet styles ──────────────────────────────────────────────────────────────

const sheetStyles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  kavWrapper: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 10,
    gap: 12,
    maxHeight: '90%',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 4,
  },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  platformLabel: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  dateLabel: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    marginTop: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    fontWeight: '600',
  },

  imagePreview: {
    width: '100%',
    aspectRatio: 1,
    maxHeight: 200,
    borderRadius: 12,
  },
  imagePlaceholder: {
    width: '100%',
    height: 120,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  imagePlaceholderText: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
  },

  themeRow: {
    flexDirection: 'row',
  },
  themeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 20,
    borderWidth: 1,
  },
  themeText: {
    fontSize: 11,
    fontFamily: 'Inter_500Medium',
    fontWeight: '500',
  },

  caption: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    lineHeight: 19,
  },
  hashtags: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    marginTop: -4,
  },

  errorBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  errorText: {
    flex: 1,
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: '#F0554E',
    lineHeight: 17,
  },

  actions: {
    gap: 10,
    paddingBottom: 4,
  },
  approveRejectRow: {
    flexDirection: 'row',
    gap: 10,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1,
  },
  actionBtnText: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    fontWeight: '600',
  },
  disabled: {
    opacity: 0.5,
  },

  regenerateSection: {
    borderTopWidth: 1,
    paddingTop: 10,
    gap: 8,
  },
  regenerateHint: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
  },
  regenerateRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  themeInput: {
    flex: 1,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
  },
  regenerateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
  },
  regenerateBtnText: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    fontWeight: '600',
  },
});
