import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
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
  Linking,
  Pressable,
  Alert,
  TextInput,
  KeyboardAvoidingView,
} from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  LEADS_FILTER_KEY,
  loadLeadsFilter,
  saveLeadsFilter,
  clearLeadsFilter,
  type LeadTypeFilter,
} from '@/utils/leadsFilterStorage';
import { useColors } from '@/hooks/useColors';
import { customFetch, getBaseUrl, getAuthToken } from '@workspace/api-client-react';

// ── Types ────────────────────────────────────────────────────────────────────

type LeadStatus = 'new' | 'contacted' | 'qualified' | 'not_interested' | 'converted';
type LeadType = 'end_user' | 'reseller';

interface Lead {
  id: number;
  firstName: string;
  lastName: string;
  email: string | null;
  company: string | null;
  title: string | null;
  phone: string | null;
  linkedinUrl: string | null;
  status: LeadStatus;
  leadType: LeadType | null;
  lastActionType: string | null;
  lastActionNote: string | null;
  lastActionAt: string | null;
  notes: string | null;
  createdAt: string;
}

const LEAD_TYPE_LABELS: Record<LeadType, string> = {
  end_user: 'End User',
  reseller: 'Reseller',
};

const LEAD_TYPE_COLORS: Record<LeadType, string> = {
  end_user: '#7C8CFF',
  reseller: '#F59E0B',
};

interface EmailTemplate {
  id: number;
  name: string;
  subject: string;
  body: string;
  productId: number | null;
}

interface AiSuggestion {
  opener: string;
  approach: 'value_link' | 'collaboration' | 'product_intro';
  approachLabel: string;
  subject?: string;
  message: string;
  link?: string;
}
const STATUS_LABELS: Record<LeadStatus, string> = {
  new: 'New',
  contacted: 'Contacted',
  qualified: 'Qualified',
  not_interested: 'Not Interested',
  converted: 'Converted',
};

const STATUS_COLORS: Record<LeadStatus, string> = {
  new: '#9AA6BF',
  contacted: '#7C8CFF',
  qualified: '#4DD4C1',
  not_interested: '#F0554E',
  converted: '#3FD07A',
};

const STATUS_ORDER: LeadStatus[] = ['new', 'contacted', 'qualified', 'not_interested', 'converted'];

// ── Schedule presets ─────────────────────────────────────────────────────────

function getSchedulePresets() {
  const now = new Date();
  const in5 = new Date(now.getTime() + 5 * 60_000);
  const in1h = new Date(now.getTime() + 60 * 60_000);
  const tomorrow9 = new Date(now);
  tomorrow9.setDate(tomorrow9.getDate() + 1);
  tomorrow9.setHours(9, 0, 0, 0);

  return [
    { label: 'In 5 minutes', date: in5 },
    { label: 'In 1 hour', date: in1h },
    { label: 'Tomorrow 9 AM', date: tomorrow9 },
  ];
}

function formatWindowTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatWindowDate(date: Date): string {
  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const isTomorrow = date.toDateString() === tomorrow.toDateString();
  if (isToday) return `Today at ${formatWindowTime(date)}`;
  if (isTomorrow) return `Tomorrow at ${formatWindowTime(date)}`;
  return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })} at ${formatWindowTime(date)}`;
}

// ── API helpers ───────────────────────────────────────────────────────────────

function fetchLeads(): Promise<Lead[]> {
  return customFetch<Lead[]>('/api/leads');
}

function fetchEmailTemplates(): Promise<EmailTemplate[]> {
  return customFetch<EmailTemplate[]>('/api/email-templates');
}

function patchLead(id: number, patch: Partial<Pick<Lead, 'status' | 'leadType'>>): Promise<Lead> {
  return customFetch<Lead>(`/api/leads/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

function logLeadAction(id: number, lastActionType: string, lastActionNote: string): Promise<Lead> {
  return customFetch<Lead>(`/api/leads/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ logAction: true, lastActionType, lastActionNote: lastActionNote || undefined }),
  });
}

function bulkScheduleEmail(payload: {
  leadIds: number[];
  templateId: number | null;
  subject: string;
  body: string;
  scheduledFor: string;
}): Promise<{ scheduled: number; skipped: number; duplicates: number; batchId: string }> {
  return customFetch<{ scheduled: number; skipped: number; duplicates: number; batchId: string }>('/api/leads/bulk-schedule-email', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

interface RecentLead {
  leadId: number;
  lastSentAt: string;
}

function checkEmailRecency(leadIds: number[], withinDays = 3): Promise<{ recentLeadIds: number[]; recentLeads: RecentLead[]; withinDays: number }> {
  return customFetch<{ recentLeadIds: number[]; recentLeads: RecentLead[]; withinDays: number }>('/api/leads/bulk-email-recency-check', {
    method: 'POST',
    body: JSON.stringify({ leadIds, withinDays }),
  });
}

function timeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

function createLead(data: {
  firstName: string; lastName: string; email: string; phone: string;
  company: string; title: string; linkedinUrl: string;
  leadType: LeadType | null;
}): Promise<Lead> {
  return customFetch<Lead>('/api/leads', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

function extractFromImage(imageBase64: string, mimeType: string): Promise<{
  firstName: string; lastName: string; email: string; phone: string;
  linkedinUrl: string; company: string; title: string;
}> {
  return customFetch('/api/leads/extract-from-image', {
    method: 'POST',
    body: JSON.stringify({ imageBase64, mimeType }),
  });
}

function fetchAiAssistant(leadId: number): Promise<AiSuggestion> {
  return customFetch<AiSuggestion>(`/api/leads/${leadId}/ai-assistant`, {
    method: 'POST',
  });
}

// ── Products (for import modal) ───────────────────────────────────────────────

interface Product {
  id: number;
  name: string;
}

function fetchProducts(): Promise<Product[]> {
  return customFetch<Product[]>('/api/products');
}

// ── Apollo CSV import (XHR streaming — works in React Native) ────────────────
// React Native's default fetch does not expose response.body as a ReadableStream,
// so we use XMLHttpRequest with onprogress which fires incrementally as chunks
// arrive, giving us live SSE event parsing without any extra packages.

async function importApolloMobile(
  csv: string,
  productId: number | null,
  onProgress: (processed: number, total: number) => void,
): Promise<{ imported: number; updated: number }> {
  const [token, baseUrl] = await Promise.all([getAuthToken(), Promise.resolve(getBaseUrl())]);
  const url = `${baseUrl ?? ''}/api/leads/import-apollo`;

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    // buffer accumulates incomplete SSE lines across onprogress calls.
    // Only complete \n-terminated lines are parsed; the tail is held until
    // more data arrives. This mirrors the web SSE parser exactly.
    let offset = 0;
    let sseBuffer = '';
    let result = { imported: 0, updated: 0 };
    let lastError: Error | null = null;

    function flushBuffer() {
      const lines = sseBuffer.split('\n');
      sseBuffer = lines.pop() ?? ''; // keep any incomplete trailing line
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) continue;
        try {
          const event = JSON.parse(trimmed.slice(6));
          if (event.type === 'progress') {
            onProgress(event.processed as number, event.total as number);
          } else if (event.type === 'done') {
            result = { imported: event.imported as number, updated: event.updated as number };
          } else if (event.type === 'error') {
            lastError = new Error(event.message ?? 'Import failed');
          }
        } catch {
          // Malformed / partial JSON on this line — discard and continue
        }
      }
    }

    xhr.onprogress = () => {
      sseBuffer += xhr.responseText.slice(offset);
      offset = xhr.responseText.length;
      flushBuffer();
    };

    xhr.onload = () => {
      // Append anything not yet seen by onprogress, then flush the final buffer.
      sseBuffer += xhr.responseText.slice(offset);
      sseBuffer += '\n'; // ensure the last line (if any) gets processed
      flushBuffer();

      if (xhr.status >= 400) {
        reject(new Error(`Import failed (${xhr.status})`));
        return;
      }
      if (lastError) { reject(lastError); return; }
      resolve(result);
    };

    xhr.onerror = () => reject(new Error('Network error during import'));
    xhr.onabort = () => reject(new Error('Import cancelled'));

    xhr.send(JSON.stringify({ csv, productId }));
  });
}

// ── Add Lead form fields ──────────────────────────────────────────────────────

interface AddLeadForm {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  company: string;
  title: string;
  linkedinUrl: string;
}

const EMPTY_FORM: AddLeadForm = {
  firstName: '', lastName: '', email: '', phone: '',
  company: '', title: '', linkedinUrl: '',
};

const ADD_LEAD_DRAFT_KEY = '@closer/add_lead_draft';
function AddLeadModal({
  visible,
  colors,
  insets,
  onClose,
  onCreated,
}: {
  visible: boolean;
  colors: ReturnType<typeof useColors>;
  insets: { top: number; bottom: number };
  onClose: () => void;
  onCreated: (lead: Lead) => void;
}) {
  const [form, setForm] = useState<AddLeadForm>(EMPTY_FORM);
  const [leadType, setLeadType] = useState<LeadType | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);
  // Track whether this is the first form update after loading the draft so we
  // don't immediately overwrite storage with the empty initial state.
  const draftLoadedRef = useRef(false);

  // Load draft when modal becomes visible
  useEffect(() => {
    if (!visible) return;
    AsyncStorage.getItem(ADD_LEAD_DRAFT_KEY).then((raw) => {
      if (!raw) {
        draftLoadedRef.current = true;
        return;
      }
      try {
        const draft: AddLeadForm = JSON.parse(raw);
        const hasContent = Object.values(draft).some((v) => v.trim().length > 0);
        if (hasContent) {
          setForm(draft);
          setHasDraft(true);
        }
      } catch {
        // Corrupt draft — ignore
      }
      draftLoadedRef.current = true;
    });
  }, [visible]);

  // Persist form to AsyncStorage on every change (after draft is loaded)
  useEffect(() => {
    if (!draftLoadedRef.current) return;
    const hasContent = Object.values(form).some((v) => v.trim().length > 0);
    if (hasContent) {
      AsyncStorage.setItem(ADD_LEAD_DRAFT_KEY, JSON.stringify(form));
      setHasDraft(true);
    } else {
      AsyncStorage.removeItem(ADD_LEAD_DRAFT_KEY);
      setHasDraft(false);
    }
  }, [form]);

  const clearDraft = useCallback(() => {
    Alert.alert('Clear draft', 'Discard all entered information?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: () => {
          AsyncStorage.removeItem(ADD_LEAD_DRAFT_KEY);
          setForm(EMPTY_FORM);
          setLeadType(null);
          setHasDraft(false);
          draftLoadedRef.current = true;
        },
      },
    ]);
  }, []);

  const field = (key: keyof AddLeadForm) => ({
    value: form[key],
    onChangeText: (v: string) => setForm((f) => ({ ...f, [key]: v })),
  });

  const processImage = useCallback(async (base64: string, mimeType: string) => {
    setExtracting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const extracted = await extractFromImage(base64, mimeType);
      setForm({
        firstName: extracted.firstName || '',
        lastName: extracted.lastName || '',
        email: extracted.email || '',
        phone: extracted.phone || '',
        company: extracted.company || '',
        title: extracted.title || '',
        linkedinUrl: extracted.linkedinUrl || '',
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert('Extraction failed', 'Could not extract contact info from the image. Please fill in the fields manually.');
    } finally {
      setExtracting(false);
    }
  }, []);

  const handleChooseFromLibrary = useCallback(async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission required', 'Please allow access to your photo library to import a contact.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        base64: true,
        quality: 0.85,
        allowsEditing: true,
      });

      if (result.canceled || !result.assets[0]) return;

      const asset = result.assets[0];
      if (!asset.base64) {
        Alert.alert('Error', 'Could not read image data. Please try again.');
        return;
      }

      await processImage(asset.base64, asset.mimeType ?? 'image/jpeg');
    } catch {
      Alert.alert('Error', 'Failed to open image picker.');
    }
  }, [processImage]);

  const handleTakePhoto = useCallback(async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission required', 'Please allow camera access to take a photo of a contact.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        base64: true,
        quality: 0.85,
        allowsEditing: true,
      });

      if (result.canceled || !result.assets[0]) return;

      const asset = result.assets[0];
      if (!asset.base64) {
        Alert.alert('Error', 'Could not read image data. Please try again.');
        return;
      }

      await processImage(asset.base64, asset.mimeType ?? 'image/jpeg');
    } catch {
      Alert.alert('Error', 'Failed to open camera.');
    }
  }, [processImage]);

  const handlePickImage = useCallback(() => {
    Alert.alert(
      'Import contact',
      'How would you like to import a contact?',
      [
        { text: 'Take Photo', onPress: handleTakePhoto },
        { text: 'Choose from Library', onPress: handleChooseFromLibrary },
        { text: 'Cancel', style: 'cancel' },
      ],
      { cancelable: true },
    );
  }, [handleTakePhoto, handleChooseFromLibrary]);

  const handleSave = useCallback(async () => {
    if (!form.firstName.trim() && !form.lastName.trim()) {
      Alert.alert('Name required', 'Please enter at least a first or last name.');
      return;
    }
    setSaving(true);
    try {
      const lead = await createLead({ ...form, leadType });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Clear draft on success
      await AsyncStorage.removeItem(ADD_LEAD_DRAFT_KEY);
      setForm(EMPTY_FORM);
      setLeadType(null);
      setHasDraft(false);
      draftLoadedRef.current = false;
      onCreated(lead);
    } catch {
      Alert.alert('Error', 'Failed to save lead. Please try again.');
    } finally {
      setSaving(false);
    }
  }, [form, leadType, onCreated]);

  // Close without clearing: draft is preserved in AsyncStorage
  const handleClose = useCallback(() => {
    draftLoadedRef.current = false;
    onClose();
  }, [onClose]);

  const inputStyle = [
    addLeadStyles.input,
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
        style={[addLeadStyles.modalRoot, { backgroundColor: colors.background }]}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Header */}
        <View style={[addLeadStyles.modalHeader, { borderBottomColor: colors.border, paddingTop: insets.top + 16 }]}>
          <TouchableOpacity onPress={handleClose} hitSlop={8} style={addLeadStyles.cancelBtn}>
            <Text style={[addLeadStyles.cancelText, { color: colors.mutedForeground }]}>Cancel</Text>
          </TouchableOpacity>
          <Text style={[addLeadStyles.modalTitle, { color: colors.foreground }]}>Add Lead</Text>
          <TouchableOpacity
            onPress={handleSave}
            hitSlop={8}
            disabled={saving || extracting}
            style={addLeadStyles.saveBtn}
          >
            {saving ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Text style={[addLeadStyles.saveText, { color: saving || extracting ? colors.mutedForeground : colors.primary }]}>
                Save
              </Text>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView
          style={addLeadStyles.modalScroll}
          contentContainerStyle={[addLeadStyles.modalContent, { paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Draft restored banner */}
          {hasDraft && (
            <View style={[addLeadStyles.draftBanner, { backgroundColor: colors.primary + '12', borderColor: colors.primary + '33' }]}>
              <Feather name="bookmark" size={13} color={colors.primary} />
              <Text style={[addLeadStyles.draftBannerText, { color: colors.primary }]}>Draft restored</Text>
              <TouchableOpacity onPress={clearDraft} hitSlop={8} style={addLeadStyles.draftClearBtn}>
                <Text style={[addLeadStyles.draftClearText, { color: colors.mutedForeground }]}>Clear</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Import from image button */}
          <TouchableOpacity
            style={[addLeadStyles.importBtn, { backgroundColor: colors.ai + '18', borderColor: colors.ai + '55' }]}
            onPress={handlePickImage}
            disabled={extracting}
            activeOpacity={0.75}
          >
            {extracting ? (
              <>
                <ActivityIndicator size="small" color={colors.ai} />
                <Text style={[addLeadStyles.importBtnText, { color: colors.ai }]}>Extracting contact info…</Text>
              </>
            ) : (
              <>
                <Feather name="camera" size={18} color={colors.ai} />
                <Text style={[addLeadStyles.importBtnText, { color: colors.ai }]}>Import from image</Text>
              </>
            )}
          </TouchableOpacity>

          <Text style={[addLeadStyles.sectionLabel, { color: colors.mutedForeground }]}>NAME</Text>
          <View style={addLeadStyles.nameRow}>
            <TextInput
              style={[inputStyle, addLeadStyles.halfInput]}
              placeholder="First name"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="words"
              autoCorrect={false}
              {...field('firstName')}
            />
            <TextInput
              style={[inputStyle, addLeadStyles.halfInput]}
              placeholder="Last name"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="words"
              autoCorrect={false}
              {...field('lastName')}
            />
          </View>

          <Text style={[addLeadStyles.sectionLabel, { color: colors.mutedForeground }]}>CONTACT</Text>
          <TextInput
            style={inputStyle}
            placeholder="Email address"
            placeholderTextColor={colors.mutedForeground}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            {...field('email')}
          />
          <TextInput
            style={[inputStyle, addLeadStyles.inputGap]}
            placeholder="Phone number"
            placeholderTextColor={colors.mutedForeground}
            keyboardType="phone-pad"
            {...field('phone')}
          />

          <Text style={[addLeadStyles.sectionLabel, { color: colors.mutedForeground }]}>WORK</Text>
          <TextInput
            style={inputStyle}
            placeholder="Company"
            placeholderTextColor={colors.mutedForeground}
            autoCapitalize="words"
            autoCorrect={false}
            {...field('company')}
          />
          <TextInput
            style={[inputStyle, addLeadStyles.inputGap]}
            placeholder="Job title"
            placeholderTextColor={colors.mutedForeground}
            autoCapitalize="words"
            autoCorrect={false}
            {...field('title')}
          />

          <Text style={[addLeadStyles.sectionLabel, { color: colors.mutedForeground }]}>LINKEDIN</Text>
          <TextInput
            style={inputStyle}
            placeholder="https://linkedin.com/in/…"
            placeholderTextColor={colors.mutedForeground}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            {...field('linkedinUrl')}
          />

          <Text style={[addLeadStyles.sectionLabel, { color: colors.mutedForeground }]}>LEAD TYPE</Text>
          <View style={addLeadStyles.typeRow}>
            {([null, 'end_user', 'reseller'] as const).map((t) => {
              const label = t === null ? 'None' : t === 'end_user' ? 'End User' : 'Reseller';
              const isActive = leadType === t;
              const activeColor = t === 'reseller' ? '#7C8CFF' : t === 'end_user' ? '#4DD4C1' : colors.mutedForeground;
              return (
                <TouchableOpacity
                  key={t ?? 'none'}
                  onPress={() => { Haptics.selectionAsync(); setLeadType(t); }}
                  style={[
                    addLeadStyles.typeChip,
                    {
                      backgroundColor: isActive ? activeColor + '22' : colors.card,
                      borderColor: isActive ? activeColor : colors.border,
                    },
                  ]}
                  activeOpacity={0.75}
                >
                  <Text style={[addLeadStyles.typeChipText, { color: isActive ? activeColor : colors.mutedForeground }]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Save button */}
          <TouchableOpacity
            style={[
              addLeadStyles.savePrimaryBtn,
              { backgroundColor: saving || extracting ? colors.muted : colors.primary },
            ]}
            onPress={handleSave}
            disabled={saving || extracting}
            activeOpacity={0.8}
          >
            {saving ? (
              <ActivityIndicator size="small" color={colors.primaryForeground} />
            ) : (
              <>
                <Feather name="user-plus" size={16} color={colors.primaryForeground} />
                <Text style={[addLeadStyles.savePrimaryText, { color: colors.primaryForeground }]}>Add Lead</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const addLeadStyles = StyleSheet.create({
  modalRoot: { flex: 1 },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  cancelBtn: { minWidth: 56 },
  cancelText: { fontSize: 16, fontFamily: 'Inter_400Regular' },
  modalTitle: { fontSize: 17, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold' },
  saveBtn: { minWidth: 56, alignItems: 'flex-end' },
  saveText: { fontSize: 16, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold' },
  modalScroll: { flex: 1 },
  modalContent: { paddingHorizontal: 20, paddingTop: 24, gap: 0 },
  importBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 14,
    marginBottom: 28,
  },
  importBtnText: {
    fontSize: 15,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 0.8,
    marginBottom: 8,
    marginTop: 20,
  },
  nameRow: { flexDirection: 'row', gap: 10 },
  halfInput: { flex: 1 },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
  },
  inputGap: { marginTop: 10 },
  savePrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    paddingVertical: 16,
    marginTop: 32,
  },
  savePrimaryText: {
    fontSize: 16,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
  },
  draftBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 16,
  },
  draftBannerText: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
  },
  draftClearBtn: {
    paddingHorizontal: 4,
  },
  draftClearText: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    fontWeight: '600' as const,
  },
  typeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  typeChip: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 10,
  },
  typeChipText: {
    fontSize: 13,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
  },
});

function StatusBadge({ status }: { status: LeadStatus }) {
  const color = STATUS_COLORS[status] ?? '#9AA6BF';
  return (
    <View style={[styles.badge, { backgroundColor: color + '22' }]}>
      <Text style={[styles.badgeText, { color }]}>{STATUS_LABELS[status]}</Text>
    </View>
  );
}

// ── Lead row ─────────────────────────────────────────────────────────────────

function LeadRow({
  lead,
  colors,
  onPress,
  onLongPress,
  selectMode,
  isSelected,
}: {
  lead: Lead;
  colors: ReturnType<typeof useColors>;
  onPress: () => void;
  onLongPress: () => void;
  selectMode: boolean;
  isSelected: boolean;
}) {
  const fullName = [lead.firstName, lead.lastName].filter(Boolean).join(' ') || 'Unknown';

  return (
    <TouchableOpacity
      style={[
        styles.leadRow,
        {
          backgroundColor: isSelected ? colors.primary + '18' : colors.card,
          borderColor: isSelected ? colors.primary + '66' : colors.border,
        },
      ]}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      activeOpacity={0.75}
    >
      {/* Checkbox / Avatar */}
      {selectMode ? (
        <View
          style={[
            styles.checkbox,
            {
              borderColor: isSelected ? colors.primary : colors.border,
              backgroundColor: isSelected ? colors.primary : 'transparent',
            },
          ]}
        >
          {isSelected && <Feather name="check" size={13} color="#fff" />}
        </View>
      ) : (
        <View style={[styles.avatar, { backgroundColor: colors.primary + '22' }]}>
          <Text style={[styles.avatarText, { color: colors.primary }]}>
            {(lead.firstName?.[0] ?? lead.lastName?.[0] ?? '?').toUpperCase()}
          </Text>
        </View>
      )}

      <View style={styles.leadInfo}>
        <Text style={[styles.leadName, { color: colors.foreground }]} numberOfLines={1}>
          {fullName}
        </Text>
        {(lead.company || lead.title) ? (
          <Text style={[styles.leadSub, { color: colors.mutedForeground }]} numberOfLines={1}>
            {[lead.title, lead.company].filter(Boolean).join(' · ')}
          </Text>
        ) : null}
      </View>

      <View style={styles.leadRight}>
        {lead.leadType ? (
          <View style={[styles.leadTypeBadge, { backgroundColor: LEAD_TYPE_COLORS[lead.leadType] + '22' }]}>
            <Text style={[styles.leadTypeBadgeText, { color: LEAD_TYPE_COLORS[lead.leadType] }]}>
              {LEAD_TYPE_LABELS[lead.leadType]}
            </Text>
          </View>
        ) : null}
        <StatusBadge status={lead.status as LeadStatus} />
        {!selectMode && (
          <Feather name="chevron-right" size={16} color={colors.mutedForeground} style={{ marginTop: 4 }} />
        )}
      </View>
    </TouchableOpacity>
  );
}

const RECENCY_DAYS = 3;
function BulkEmailModal({
  selectedLeadIds,
  selectedLeads,
  selectedCount,
  colors,
  insets,
  onClose,
  onSend,
  onDeselectLeads,
}: {
  selectedLeadIds: number[];
  selectedLeads: Lead[];
  selectedCount: number;
  colors: ReturnType<typeof useColors>;
  insets: { bottom: number; top: number };
  onClose: () => void;
  onSend: (payload: { templateId: number | null; subject: string; body: string; scheduledFor: string }) => void;
  onDeselectLeads: (ids: number[]) => void;
}) {
  const templatesQ = useQuery({
    queryKey: ['email-templates'],
    queryFn: fetchEmailTemplates,
  });
  const templates = templatesQ.data ?? [];

  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null);
  const [customSubject, setCustomSubject] = useState('');
  const [customBody, setCustomBody] = useState('');
  const [schedulePresetIndex, setSchedulePresetIndex] = useState(0);
  const [step, setStep] = useState<'template' | 'confirm'>('template');
  const [sending, setSending] = useState(false);
  const [recentLeads, setRecentLeads] = useState<RecentLead[]>([]);
  const [recencyLoading, setRecencyLoading] = useState(false);
  const recentLeadIds = recentLeads.map(r => r.leadId);

  // Custom date/time picker state
  const CUSTOM_INDEX = 3;
  const [customDate, setCustomDate] = useState<Date>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return d;
  });
  // Android requires two-step: pick date then time
  const [androidPickerMode, setAndroidPickerMode] = useState<'date' | 'time'>('date');
  const [showAndroidPicker, setShowAndroidPicker] = useState(false);

  const isCustom = schedulePresetIndex === CUSTOM_INDEX;

  const presets = getSchedulePresets();
  const chosenDate = isCustom ? customDate : presets[schedulePresetIndex].date;

  // Estimated end of window: count × average stagger (~67.5 s)
  const windowEndMs = chosenDate.getTime() + (selectedCount - 1) * 67_500;
  const windowEnd = new Date(windowEndMs);

  const effectiveSubject = selectedTemplate?.subject ?? customSubject;
  const effectiveBody = selectedTemplate?.body ?? customBody;
  const canProceed = effectiveSubject.trim().length > 0 && effectiveBody.trim().length > 0;

  const handleSend = async () => {
    setSending(true);
    try {
      await onSend({
        templateId: selectedTemplate?.id ?? null,
        subject: effectiveSubject,
        body: effectiveBody,
        scheduledFor: chosenDate.toISOString(),
      });
    } finally {
      setSending(false);
    }
  };

  const handleAndroidDateChange = (event: DateTimePickerEvent, selected?: Date) => {
    setShowAndroidPicker(false);
    if (event.type === 'dismissed' || !selected) return;
    if (androidPickerMode === 'date') {
      const next = new Date(customDate);
      next.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
      setCustomDate(next);
      setAndroidPickerMode('time');
      setShowAndroidPicker(true);
    } else {
      const next = new Date(customDate);
      next.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
      setCustomDate(next);
      setAndroidPickerMode('date');
    }
  };

  // Advance to confirm step: validate custom date, then kick off recency check
  const handleGoToConfirm = async () => {
    if (!canProceed) return;
    if (isCustom && customDate.getTime() <= Date.now()) {
      Alert.alert('Invalid time', 'Please choose a time in the future.');
      return;
    }
    Haptics.selectionAsync();
    setStep('confirm');
    if (selectedLeadIds.length > 0) {
      setRecencyLoading(true);
      try {
        const result = await checkEmailRecency(selectedLeadIds, RECENCY_DAYS);
        setRecentLeads(result.recentLeads ?? result.recentLeadIds.map(id => ({ leadId: id, lastSentAt: new Date().toISOString() })));
      } catch {
        setRecentLeads([]);
      } finally {
        setRecencyLoading(false);
      }
    }
  };

  return (
    <Modal
      visible
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.sheetBackdrop} onPress={onClose} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}
      >
        <View
          style={[
            styles.sheet,
            styles.bulkSheet,
            {
              backgroundColor: colors.card,
              paddingBottom: insets.bottom + 24,
            },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: colors.border }]} />

          {/* Header */}
          <View style={styles.bulkHeader}>
            <View style={[styles.bulkIconWrap, { backgroundColor: colors.primary + '1A' }]}>
              <Feather name="send" size={18} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.bulkTitle, { color: colors.foreground }]}>Send Bulk Email</Text>
              <Text style={[styles.bulkSub, { color: colors.mutedForeground }]}>
                {selectedCount} lead{selectedCount !== 1 ? 's' : ''} selected
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={12}>
              <Feather name="x" size={20} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          {step === 'template' ? (
            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              style={{ maxHeight: 480 }}
            >
              {/* Template picker */}
              <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
                CHOOSE A TEMPLATE
              </Text>

              {templatesQ.isLoading ? (
                <ActivityIndicator color={colors.primary} style={{ marginVertical: 20 }} />
              ) : templates.length === 0 ? (
                <View style={[styles.emptyInline, { borderColor: colors.border }]}>
                  <Feather name="inbox" size={24} color={colors.mutedForeground} />
                  <Text style={[styles.emptyInlineText, { color: colors.mutedForeground }]}>
                    No templates yet — create one in the web app
                  </Text>
                </View>
              ) : (
                <View style={styles.templateList}>
                  {templates.map((t) => {
                    const active = selectedTemplate?.id === t.id;
                    return (
                      <TouchableOpacity
                        key={t.id}
                        style={[
                          styles.templateCard,
                          {
                            backgroundColor: active ? colors.primary + '18' : colors.secondary,
                            borderColor: active ? colors.primary + '66' : colors.border,
                          },
                        ]}
                        onPress={() => {
                          Haptics.selectionAsync();
                          setSelectedTemplate(active ? null : t);
                          setCustomSubject('');
                          setCustomBody('');
                        }}
                        activeOpacity={0.8}
                      >
                        <View style={styles.templateCardRow}>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.templateName, { color: colors.foreground }]}>
                              {t.name}
                            </Text>
                            <Text style={[styles.templateSubject, { color: colors.mutedForeground }]} numberOfLines={1}>
                              {t.subject}
                            </Text>
                          </View>
                          {active && (
                            <View style={[styles.templateCheck, { backgroundColor: colors.primary }]}>
                              <Feather name="check" size={12} color="#fff" />
                            </View>
                          )}
                        </View>
                        <Text style={[styles.templatePreview, { color: colors.mutedForeground }]} numberOfLines={2}>
                          {t.body}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {/* Custom subject/body (only if no template selected) */}
              {!selectedTemplate && (
                <>
                  <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginTop: 16 }]}>
                    OR WRITE CUSTOM EMAIL
                  </Text>
                  <TextInput
                    style={[styles.customInput, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground }]}
                    placeholder="Subject"
                    placeholderTextColor={colors.mutedForeground}
                    value={customSubject}
                    onChangeText={setCustomSubject}
                    returnKeyType="next"
                  />
                  <TextInput
                    style={[styles.customInput, styles.customBody, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground }]}
                    placeholder="Body — use {{firstName}}, {{company}}, etc."
                    placeholderTextColor={colors.mutedForeground}
                    value={customBody}
                    onChangeText={setCustomBody}
                    multiline
                    numberOfLines={4}
                    textAlignVertical="top"
                  />
                </>
              )}

              {/* Schedule picker */}
              <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginTop: 16 }]}>
                SEND WINDOW
              </Text>
              <View style={styles.presetRow}>
                {presets.map((p, i) => {
                  const active = schedulePresetIndex === i;
                  return (
                    <TouchableOpacity
                      key={i}
                      onPress={() => {
                        Haptics.selectionAsync();
                        setSchedulePresetIndex(i);
                      }}
                      style={[
                        styles.presetChip,
                        {
                          backgroundColor: active ? colors.primary + '22' : colors.secondary,
                          borderColor: active ? colors.primary : colors.border,
                        },
                      ]}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.presetChipText, { color: active ? colors.primary : colors.mutedForeground }]}>
                        {p.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
                {/* Custom date/time chip */}
                <TouchableOpacity
                  onPress={() => {
                    Haptics.selectionAsync();
                    setSchedulePresetIndex(CUSTOM_INDEX);
                    if (Platform.OS === 'android') {
                      setAndroidPickerMode('date');
                      setShowAndroidPicker(true);
                    }
                  }}
                  style={[
                    styles.presetChip,
                    {
                      backgroundColor: isCustom ? colors.primary + '22' : colors.secondary,
                      borderColor: isCustom ? colors.primary : colors.border,
                    },
                  ]}
                  activeOpacity={0.8}
                >
                  <Feather name="calendar" size={13} color={isCustom ? colors.primary : colors.mutedForeground} style={{ marginRight: 4 }} />
                  <Text style={[styles.presetChipText, { color: isCustom ? colors.primary : colors.mutedForeground }]}>
                    Custom
                  </Text>
                </TouchableOpacity>
              </View>

              {/* iOS inline date+time picker when Custom is selected */}
              {isCustom && Platform.OS === 'ios' && (
                <View style={[styles.iosPickerWrap, { borderColor: colors.border, backgroundColor: colors.secondary }]}>
                  <DateTimePicker
                    value={customDate}
                    mode="datetime"
                    display="spinner"
                    minimumDate={new Date(Date.now() + 60_000)}
                    onChange={(_event: DateTimePickerEvent, selected?: Date) => {
                      if (selected) setCustomDate(selected);
                    }}
                    style={{ width: '100%' }}
                    textColor={colors.foreground}
                    accentColor={colors.primary}
                    themeVariant="dark"
                  />
                </View>
              )}

              {/* Android modal date/time picker */}
              {showAndroidPicker && (
                <DateTimePicker
                  value={customDate}
                  mode={androidPickerMode}
                  display="default"
                  minimumDate={androidPickerMode === 'date' ? new Date(Date.now() + 60_000) : undefined}
                  onChange={handleAndroidDateChange}
                />
              )}

              {/* Show chosen custom date summary on Android */}
              {isCustom && Platform.OS === 'android' && (
                <TouchableOpacity
                  style={[styles.androidCustomSummary, { borderColor: colors.primary + '66', backgroundColor: colors.primary + '0F' }]}
                  onPress={() => {
                    setAndroidPickerMode('date');
                    setShowAndroidPicker(true);
                  }}
                  activeOpacity={0.8}
                >
                  <Feather name="calendar" size={14} color={colors.primary} />
                  <Text style={[styles.androidCustomSummaryText, { color: colors.primary }]}>
                    {formatWindowDate(customDate)}
                  </Text>
                  <Feather name="edit-2" size={13} color={colors.primary} />
                </TouchableOpacity>
              )}

              <View style={{ height: 20 }} />
            </ScrollView>
          ) : (
            /* Confirm step */
            <View style={styles.confirmContent}>
              <View style={[styles.confirmCard, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
                {/* Count */}
                <View style={[styles.confirmRow, { borderBottomColor: colors.border }]}>
                  <Feather name="users" size={16} color={colors.mutedForeground} />
                  <Text style={[styles.confirmLabel, { color: colors.mutedForeground }]}>Recipients</Text>
                  <Text style={[styles.confirmValue, { color: colors.foreground }]}>
                    {selectedCount} lead{selectedCount !== 1 ? 's' : ''}
                  </Text>
                </View>

                {/* Template */}
                <View style={[styles.confirmRow, { borderBottomColor: colors.border }]}>
                  <Feather name="file-text" size={16} color={colors.mutedForeground} />
                  <Text style={[styles.confirmLabel, { color: colors.mutedForeground }]}>Template</Text>
                  <Text style={[styles.confirmValue, { color: colors.foreground }]} numberOfLines={1}>
                    {selectedTemplate?.name ?? 'Custom email'}
                  </Text>
                </View>

                {/* Send window */}
                <View style={styles.confirmRow}>
                  <Feather name="clock" size={16} color={colors.mutedForeground} />
                  <Text style={[styles.confirmLabel, { color: colors.mutedForeground }]}>Send window</Text>
                  <View style={{ alignItems: 'flex-end', flex: 1 }}>
                    <Text style={[styles.confirmValue, { color: colors.foreground }]}>
                      {formatWindowDate(chosenDate)}
                    </Text>
                    {selectedCount > 1 && (
                      <Text style={[styles.confirmWindowEnd, { color: colors.mutedForeground }]}>
                        → {formatWindowDate(windowEnd)}
                      </Text>
                    )}
                  </View>
                </View>
              </View>

              {/* Recency warning */}
              {recencyLoading ? (
                <View style={[styles.recencyBanner, { backgroundColor: '#F0A50010', borderColor: '#F0A50033' }]}>
                  <ActivityIndicator size="small" color="#F0A500" />
                  <Text style={[styles.recencyText, { color: '#F0A500' }]}>Checking recent sends…</Text>
                </View>
              ) : recentLeadIds.length > 0 ? (
                <View style={[styles.recencyBanner, { backgroundColor: '#F0554E10', borderColor: '#F0554E33' }]}>
                  <Feather name="alert-triangle" size={14} color="#F0554E" />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.recencyText, { color: '#F0554E' }]}>
                      {recentLeadIds.length} of {selectedCount} lead{selectedCount !== 1 ? 's' : ''} received an email in the last {RECENCY_DAYS} days.
                    </Text>
                    {recentLeads.map(rl => {
                      const lead = selectedLeads.find(l => l.id === rl.leadId);
                      if (!lead) return null;
                      const name = [lead.firstName, lead.lastName].filter(Boolean).join(' ');
                      const label = lead.company ? `${name}, ${lead.company}` : name;
                      return (
                        <View key={rl.leadId} style={styles.recencyLeadRow}>
                          <Text style={[styles.recencyLeadText, { color: '#F0554E99' }]} numberOfLines={1}>
                            {label} — emailed {timeAgo(rl.lastSentAt)}
                          </Text>
                          <TouchableOpacity
                            onPress={() => {
                              Haptics.selectionAsync();
                              onDeselectLeads([rl.leadId]);
                              setRecentLeads(prev => prev.filter(r => r.leadId !== rl.leadId));
                            }}
                            hitSlop={8}
                          >
                            <Feather name="x" size={12} color="#F0554E80" />
                          </TouchableOpacity>
                        </View>
                      );
                    })}
                    <TouchableOpacity
                      onPress={() => {
                        Haptics.selectionAsync();
                        onDeselectLeads(recentLeadIds);
                        setRecentLeads([]);
                      }}
                      style={styles.recencyDeselect}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.recencyDeselectText, { color: '#F0554E' }]}>
                        Deselect {recentLeadIds.length} recently emailed →
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : null}

              <View style={[styles.confirmNote, { backgroundColor: colors.primary + '0F', borderColor: colors.primary + '33' }]}>
                <Feather name="info" size={14} color={colors.primary} />
                <Text style={[styles.confirmNoteText, { color: colors.primary }]}>
                  Emails are staggered 45–90 s apart to avoid spam filters.
                  {selectedCount > 1
                    ? ` All ${selectedCount} emails will be delivered within ~${Math.ceil((selectedCount - 1) * 90 / 60)} min.`
                    : ''}
                </Text>
              </View>
            </View>
          )}

          {/* Action buttons */}
          <View style={styles.bulkActions}>
            {step === 'template' ? (
              <>
                <TouchableOpacity
                  style={[styles.bulkCancelBtn, { borderColor: colors.border }]}
                  onPress={onClose}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.bulkCancelText, { color: colors.mutedForeground }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.bulkSendBtn,
                    { backgroundColor: canProceed ? colors.primary : colors.border },
                  ]}
                  onPress={handleGoToConfirm}
                  activeOpacity={0.8}
                  disabled={!canProceed}
                >
                  <Text style={[styles.bulkSendText, { color: canProceed ? '#fff' : colors.mutedForeground }]}>
                    Review
                  </Text>
                  <Feather name="arrow-right" size={15} color={canProceed ? '#fff' : colors.mutedForeground} />
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity
                  style={[styles.bulkCancelBtn, { borderColor: colors.border }]}
                  onPress={() => setStep('template')}
                  activeOpacity={0.75}
                >
                  <Feather name="arrow-left" size={15} color={colors.mutedForeground} />
                  <Text style={[styles.bulkCancelText, { color: colors.mutedForeground }]}>Back</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.bulkSendBtn, { backgroundColor: colors.primary, opacity: sending ? 0.7 : 1 }]}
                  onPress={handleSend}
                  activeOpacity={0.8}
                  disabled={sending}
                >
                  {sending ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Feather name="send" size={15} color="#fff" />
                      <Text style={styles.bulkSendText}>
                        Schedule {selectedCount} Email{selectedCount !== 1 ? 's' : ''}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function SingleEmailComposeModal({
  lead,
  visible,
  initialSubject,
  initialBody,
  colors,
  insets,
  onClose,
  onSent,
}: {
  lead: Lead;
  visible: boolean;
  initialSubject?: string;
  initialBody?: string;
  colors: ReturnType<typeof useColors>;
  insets: { bottom: number; top: number };
  onClose: () => void;
  onSent?: () => void;
}) {
  const [subject, setSubject] = useState(initialSubject ?? '');
  const [body, setBody] = useState(initialBody ?? '');
  const [schedulePresetIndex, setSchedulePresetIndex] = useState(0);
  const [sending, setSending] = useState(false);

  // Sync initial values when they change (e.g. opened with AI draft)
  useEffect(() => {
    if (visible) {
      setSubject(initialSubject ?? '');
      setBody(initialBody ?? '');
      setSchedulePresetIndex(0);
    }
  }, [visible, initialSubject, initialBody]);

  const presets = getSchedulePresets();
  const chosenDate = presets[schedulePresetIndex]?.date ?? presets[0].date;
  const canSend = subject.trim().length > 0 && body.trim().length > 0 && !!lead.email;

  const handleSend = async () => {
    if (!canSend) return;
    setSending(true);
    try {
      await bulkScheduleEmail({
        leadIds: [lead.id],
        templateId: null,
        subject: subject.trim(),
        body: body.trim(),
        scheduledFor: chosenDate.toISOString(),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSent?.();
      onClose();
    } catch {
      Alert.alert('Error', 'Failed to schedule email. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const fullName = [lead.firstName, lead.lastName].filter(Boolean).join(' ') || 'Unknown';

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
        {/* Header */}
        <View style={[singleEmailStyles.header, { borderBottomColor: colors.border, paddingTop: Platform.OS === 'ios' ? 16 : insets.top + 16 }]}>
          <TouchableOpacity onPress={onClose} hitSlop={8} style={singleEmailStyles.cancelBtn}>
            <Text style={[singleEmailStyles.cancelText, { color: colors.mutedForeground }]}>Cancel</Text>
          </TouchableOpacity>
          <Text style={[singleEmailStyles.title, { color: colors.foreground }]}>Send Email</Text>
          <TouchableOpacity
            onPress={handleSend}
            hitSlop={8}
            disabled={!canSend || sending}
            style={singleEmailStyles.sendBtn}
          >
            {sending
              ? <ActivityIndicator size="small" color={colors.primary} />
              : <Text style={[singleEmailStyles.sendText, { color: canSend ? colors.primary : colors.mutedForeground }]}>Schedule</Text>}
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={[singleEmailStyles.body, { paddingBottom: insets.bottom + 32 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* To */}
          <View style={[singleEmailStyles.toRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[singleEmailStyles.toLabel, { color: colors.mutedForeground }]}>To</Text>
            <Text style={[singleEmailStyles.toValue, { color: colors.foreground }]} numberOfLines={1}>
              {fullName}{lead.email ? ` <${lead.email}>` : ''}
            </Text>
          </View>

          {/* Subject */}
          <View style={[singleEmailStyles.fieldCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[singleEmailStyles.fieldLabel, { color: colors.mutedForeground }]}>Subject</Text>
            <TextInput
              style={[singleEmailStyles.subjectInput, { color: colors.foreground }]}
              value={subject}
              onChangeText={setSubject}
              placeholder="Email subject…"
              placeholderTextColor={colors.mutedForeground}
              returnKeyType="next"
            />
          </View>

          {/* Body */}
          <View style={[singleEmailStyles.fieldCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[singleEmailStyles.fieldLabel, { color: colors.mutedForeground }]}>Message</Text>
            <TextInput
              style={[singleEmailStyles.bodyInput, { color: colors.foreground }]}
              value={body}
              onChangeText={setBody}
              placeholder="Write your message…"
              placeholderTextColor={colors.mutedForeground}
              multiline
              textAlignVertical="top"
            />
          </View>

          {/* Schedule presets */}
          <Text style={[singleEmailStyles.scheduleLabel, { color: colors.mutedForeground }]}>Send time</Text>
          <View style={singleEmailStyles.presetRow}>
            {presets.map((p, i) => {
              const isActive = schedulePresetIndex === i;
              return (
                <TouchableOpacity
                  key={i}
                  onPress={() => { Haptics.selectionAsync(); setSchedulePresetIndex(i); }}
                  style={[
                    singleEmailStyles.presetBtn,
                    {
                      backgroundColor: isActive ? colors.primary + '18' : colors.card,
                      borderColor: isActive ? colors.primary + '66' : colors.border,
                    },
                  ]}
                  activeOpacity={0.75}
                >
                  <Text style={[singleEmailStyles.presetText, { color: isActive ? colors.primary : colors.mutedForeground }]}>
                    {p.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Send button */}
          <TouchableOpacity
            style={[
              singleEmailStyles.sendPrimaryBtn,
              { backgroundColor: canSend ? colors.primary : colors.muted, opacity: sending ? 0.7 : 1 },
            ]}
            onPress={handleSend}
            disabled={!canSend || sending}
            activeOpacity={0.85}
          >
            {sending
              ? <ActivityIndicator color="#fff" />
              : <>
                  <Feather name="send" size={16} color="#fff" />
                  <Text style={singleEmailStyles.sendPrimaryText}>Schedule Email</Text>
                </>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}
function LeadDetailSheet({
  lead,
  colors,
  onClose,
  onStatusChange,
  onLeadTypeChange,
  onLogAction,
}: {
  lead: Lead;
  colors: ReturnType<typeof useColors>;
  onClose: () => void;
  onStatusChange: (status: LeadStatus) => void;
  onLeadTypeChange: (leadType: LeadType | null) => void;
  onLogAction: (type: string, note: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const fullName = [lead.firstName, lead.lastName].filter(Boolean).join(' ') || 'Unknown';
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [showLeadTypePicker, setShowLeadTypePicker] = useState(false);
  const [logPrompt, setLogPrompt] = useState<{ type: string; label: string } | null>(null);
  const [logNote, setLogNote] = useState('');

  // AI assistant state
  const [aiOpen, setAiOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<AiSuggestion | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  // Single-lead email compose state
  const [emailComposeVisible, setEmailComposeVisible] = useState(false);
  const [emailComposeSubject, setEmailComposeSubject] = useState('');
  const [emailComposeBody, setEmailComposeBody] = useState('');

  const openUrl = (url: string) => {
    Linking.openURL(url).catch(() =>
      Alert.alert('Error', 'Could not open this link.')
    );
  };

  const showLog = (type: string, label: string) => {
    setLogNote('');
    setLogPrompt({ type, label });
  };

  const handleCall = () => {
    if (lead.phone) {
      openUrl(`tel:${lead.phone.replace(/\s/g, '')}`);
      showLog('call', 'Call');
    }
  };

  const handleEmail = () => {
    if (lead.email) {
      openUrl(`mailto:${lead.email}`);
      showLog('email', 'Email');
    }
  };

  const handleLinkedIn = () => {
    if (lead.linkedinUrl) {
      const url = lead.linkedinUrl.startsWith('http')
        ? lead.linkedinUrl
        : `https://${lead.linkedinUrl}`;
      openUrl(url);
      showLog('linkedin', 'LinkedIn');
    }
  };

  const openAiAssistant = async () => {
    setAiOpen(true);
    setAiResult(null);
    setAiError(null);
    setAiLoading(true);
    try {
      const result = await fetchAiAssistant(lead.id);
      setAiResult(result);
    } catch {
      setAiError("Couldn't generate a suggestion. Try again.");
    } finally {
      setAiLoading(false);
    }
  };

  const openEmailComposeFromAi = (suggestion: AiSuggestion) => {
    setEmailComposeSubject(suggestion.subject ?? '');
    setEmailComposeBody(suggestion.message);
    setEmailComposeVisible(true);
  };

  return (
    <Modal
      visible
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Backdrop */}
      <Pressable style={styles.sheetBackdrop} onPress={onClose} />

      {/* Sheet */}
      <View
        style={[
          styles.sheet,
          {
            backgroundColor: colors.card,
            paddingBottom: 0,
          },
        ]}
      >
        {/* Handle */}
        <View style={[styles.handle, { backgroundColor: colors.border }]} />

        {/* Header */}
        <View style={styles.sheetHeader}>
          <View style={[styles.sheetAvatar, { backgroundColor: colors.primary + '22' }]}>
            <Text style={[styles.sheetAvatarText, { color: colors.primary }]}>
              {(lead.firstName?.[0] ?? lead.lastName?.[0] ?? '?').toUpperCase()}
            </Text>
          </View>
          <View style={styles.sheetHeaderInfo}>
            <Text style={[styles.sheetName, { color: colors.foreground }]}>{fullName}</Text>
            {lead.title ? (
              <Text style={[styles.sheetTitle, { color: colors.mutedForeground }]}>{lead.title}</Text>
            ) : null}
            {lead.company ? (
              <Text style={[styles.sheetCompany, { color: colors.mutedForeground }]}>{lead.company}</Text>
            ) : null}
          </View>
          <TouchableOpacity onPress={onClose} hitSlop={12} style={styles.sheetClose}>
            <Feather name="x" size={20} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>

        {/* Scrollable content */}
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          keyboardShouldPersistTaps="handled"
        >

        {/* Status */}
        <View style={styles.sheetSection}>
          <TouchableOpacity
            style={[styles.statusRow, { backgroundColor: colors.secondary, borderColor: colors.border }]}
            onPress={() => {
              Haptics.selectionAsync();
              setShowStatusPicker((v) => !v);
            }}
            activeOpacity={0.8}
          >
            <View style={[styles.statusDot, { backgroundColor: STATUS_COLORS[lead.status as LeadStatus] ?? '#9AA6BF' }]} />
            <Text style={[styles.statusRowLabel, { color: colors.foreground }]}>
              {STATUS_LABELS[lead.status as LeadStatus] ?? lead.status}
            </Text>
            <Feather
              name={showStatusPicker ? 'chevron-up' : 'chevron-down'}
              size={16}
              color={colors.mutedForeground}
            />
          </TouchableOpacity>

          {showStatusPicker && (
            <View style={[styles.statusPicker, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
              {STATUS_ORDER.map((s) => (
                <TouchableOpacity
                  key={s}
                  style={[
                    styles.statusOption,
                    s === lead.status && { backgroundColor: colors.primary + '18' },
                  ]}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setShowStatusPicker(false);
                    onStatusChange(s);
                  }}
                  activeOpacity={0.75}
                >
                  <View style={[styles.statusDot, { backgroundColor: STATUS_COLORS[s] }]} />
                  <Text style={[styles.statusOptionText, { color: s === lead.status ? colors.primary : colors.foreground }]}>
                    {STATUS_LABELS[s]}
                  </Text>
                  {s === lead.status && (
                    <Feather name="check" size={14} color={colors.primary} />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Lead type */}
        <View style={styles.sheetSection}>
          <TouchableOpacity
            style={[styles.statusRow, { backgroundColor: colors.secondary, borderColor: colors.border }]}
            onPress={() => {
              Haptics.selectionAsync();
              setShowLeadTypePicker((v) => !v);
            }}
            activeOpacity={0.8}
          >
            <Feather name="tag" size={14} color={lead.leadType ? LEAD_TYPE_COLORS[lead.leadType] : colors.mutedForeground} />
            <Text style={[styles.statusRowLabel, { color: lead.leadType ? colors.foreground : colors.mutedForeground, flex: 1 }]}>
              {lead.leadType ? LEAD_TYPE_LABELS[lead.leadType] : 'No type set'}
            </Text>
            <Feather
              name={showLeadTypePicker ? 'chevron-up' : 'chevron-down'}
              size={16}
              color={colors.mutedForeground}
            />
          </TouchableOpacity>

          {showLeadTypePicker && (
            <View style={[styles.statusPicker, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
              {(['end_user', 'reseller'] as LeadType[]).map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[
                    styles.statusOption,
                    t === lead.leadType && { backgroundColor: LEAD_TYPE_COLORS[t] + '18' },
                  ]}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setShowLeadTypePicker(false);
                    onLeadTypeChange(t === lead.leadType ? null : t);
                  }}
                  activeOpacity={0.75}
                >
                  <View style={[styles.statusDot, { backgroundColor: LEAD_TYPE_COLORS[t] }]} />
                  <Text style={[styles.statusOptionText, { color: t === lead.leadType ? LEAD_TYPE_COLORS[t] : colors.foreground }]}>
                    {LEAD_TYPE_LABELS[t]}
                  </Text>
                  {t === lead.leadType && (
                    <Feather name="check" size={14} color={LEAD_TYPE_COLORS[t]} />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Action buttons */}
        <View style={styles.actionRow}>
          {lead.phone ? (
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: colors.success + '1A', borderColor: colors.success + '44' }]}
              onPress={handleCall}
              activeOpacity={0.8}
            >
              <Feather name="phone" size={20} color={colors.success} />
              <Text style={[styles.actionBtnLabel, { color: colors.success }]}>Call</Text>
            </TouchableOpacity>
          ) : null}

          {lead.email ? (
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: colors.primary + '1A', borderColor: colors.primary + '44' }]}
              onPress={handleEmail}
              activeOpacity={0.8}
            >
              <Feather name="mail" size={20} color={colors.primary} />
              <Text style={[styles.actionBtnLabel, { color: colors.primary }]}>Email</Text>
            </TouchableOpacity>
          ) : null}

          {lead.linkedinUrl ? (
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: colors.ai + '1A', borderColor: colors.ai + '44' }]}
              onPress={handleLinkedIn}
              activeOpacity={0.8}
            >
              <Feather name="linkedin" size={20} color={colors.ai} />
              <Text style={[styles.actionBtnLabel, { color: colors.ai }]}>LinkedIn</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* AI Assistant */}
        <View style={styles.aiSection}>
          <TouchableOpacity
            onPress={aiOpen ? undefined : openAiAssistant}
            disabled={aiLoading}
            style={[
              styles.aiBtn,
              {
                backgroundColor: aiOpen ? colors.ai + '18' : colors.secondary,
                borderColor: aiOpen ? colors.ai + '55' : colors.border,
              },
            ]}
            activeOpacity={0.8}
          >
            {aiLoading
              ? <ActivityIndicator size="small" color={colors.ai} />
              : <Feather name="zap" size={16} color={colors.ai} />}
            <Text style={[styles.aiBtnText, { color: aiOpen ? colors.ai : colors.mutedForeground }]}>
              {aiLoading ? 'Generating suggestion…' : 'AI Assistant'}
            </Text>
            {!aiOpen && !aiLoading && (
              <Feather name="chevron-right" size={14} color={colors.mutedForeground} />
            )}
          </TouchableOpacity>

          {aiOpen && (
            <View style={[styles.aiPanel, { backgroundColor: colors.secondary, borderColor: colors.ai + '33' }]}>
              {aiLoading && (
                <View style={styles.aiPanelRow}>
                  <ActivityIndicator size="small" color={colors.ai} />
                  <Text style={[styles.aiPanelMuted, { color: colors.mutedForeground }]}>
                    Researching {lead.firstName}'s profile…
                  </Text>
                </View>
              )}

              {aiError && !aiLoading && (
                <View style={{ gap: 8 }}>
                  <Text style={[styles.aiPanelMuted, { color: '#F0554E' }]}>{aiError}</Text>
                  <TouchableOpacity onPress={openAiAssistant}>
                    <Text style={[styles.aiRetryText, { color: colors.ai }]}>Try again</Text>
                  </TouchableOpacity>
                </View>
              )}

              {aiResult && !aiLoading && (
                <View style={{ gap: 12 }}>
                  {/* Approach badge */}
                  <View style={styles.aiPanelRow}>
                    <Feather
                      name={aiResult.approach === 'value_link' ? 'link' : aiResult.approach === 'collaboration' ? 'users' : 'package'}
                      size={12}
                      color={aiResult.approach === 'value_link' ? '#60a5fa' : aiResult.approach === 'collaboration' ? '#34d399' : '#fb923c'}
                    />
                    <Text style={[
                      styles.aiApproachText,
                      {
                        color: aiResult.approach === 'value_link' ? '#60a5fa'
                          : aiResult.approach === 'collaboration' ? '#34d399'
                          : '#fb923c',
                      },
                    ]}>
                      {aiResult.approachLabel ?? (
                        aiResult.approach === 'value_link' ? 'Value resource'
                          : aiResult.approach === 'collaboration' ? 'Collaboration / partner'
                          : 'Product intro'
                      )}
                    </Text>
                  </View>

                  {/* Opener */}
                  <View style={{ gap: 3 }}>
                    <Text style={[styles.aiFieldLabel, { color: colors.mutedForeground }]}>OPENING LINE</Text>
                    <Text style={[styles.aiOpenerText, { color: colors.foreground }]}>"{aiResult.opener}"</Text>
                  </View>

                  {/* Full message */}
                  <View style={{ gap: 3 }}>
                    <Text style={[styles.aiFieldLabel, { color: colors.mutedForeground }]}>FULL MESSAGE</Text>
                    <Text style={[styles.aiMessageText, { color: colors.foreground }]}>{aiResult.message}</Text>
                  </View>

                  {/* Subject line (if present) */}
                  {!!aiResult.subject && (
                    <View style={{ gap: 3 }}>
                      <Text style={[styles.aiFieldLabel, { color: colors.mutedForeground }]}>SUGGESTED SUBJECT</Text>
                      <Text style={[styles.aiSubjectText, { color: colors.foreground }]}>{aiResult.subject}</Text>
                    </View>
                  )}

                  {/* Actions */}
                  <View style={styles.aiActionRow}>
                    {lead.email && (
                      <TouchableOpacity
                        onPress={() => openEmailComposeFromAi(aiResult)}
                        style={[styles.aiActionBtn, { backgroundColor: colors.primary + '18', borderColor: colors.primary + '44' }]}
                        activeOpacity={0.8}
                      >
                        <Feather name="mail" size={14} color={colors.primary} />
                        <Text style={[styles.aiActionBtnText, { color: colors.primary }]}>Send Email</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      onPress={openAiAssistant}
                      style={[styles.aiActionBtn, { backgroundColor: colors.ai + '12', borderColor: colors.ai + '33' }]}
                      activeOpacity={0.8}
                    >
                      <Feather name="refresh-cw" size={13} color={colors.ai} />
                      <Text style={[styles.aiActionBtnText, { color: colors.ai }]}>Retry</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          )}
        </View>

        {/* Contact details */}
        <View style={[styles.detailCard, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
          {lead.phone ? (
            <TouchableOpacity style={styles.detailRow} onPress={handleCall} activeOpacity={0.7}>
              <Feather name="phone" size={15} color={colors.mutedForeground} />
              <Text style={[styles.detailValue, { color: colors.foreground }]}>{lead.phone}</Text>
              <Feather name="external-link" size={13} color={colors.mutedForeground} />
            </TouchableOpacity>
          ) : null}

          {lead.email ? (
            <TouchableOpacity
              style={[
                styles.detailRow,
                lead.phone ? { borderTopWidth: 1, borderTopColor: colors.border } : undefined,
              ]}
              onPress={handleEmail}
              activeOpacity={0.7}
            >
              <Feather name="mail" size={15} color={colors.mutedForeground} />
              <Text style={[styles.detailValue, { color: colors.foreground }]} numberOfLines={1}>
                {lead.email}
              </Text>
              <Feather name="external-link" size={13} color={colors.mutedForeground} />
            </TouchableOpacity>
          ) : null}

          {lead.linkedinUrl ? (
            <TouchableOpacity
              style={[
                styles.detailRow,
                (lead.phone || lead.email)
                  ? { borderTopWidth: 1, borderTopColor: colors.border }
                  : undefined,
              ]}
              onPress={handleLinkedIn}
              activeOpacity={0.7}
            >
              <Feather name="linkedin" size={15} color={colors.mutedForeground} />
              <Text style={[styles.detailValue, { color: colors.foreground }]} numberOfLines={1}>
                {lead.linkedinUrl.replace(/^https?:\/\/(www\.)?linkedin\.com\/in\//, '').replace(/\/$/, '')}
              </Text>
              <Feather name="external-link" size={13} color={colors.mutedForeground} />
            </TouchableOpacity>
          ) : null}

          {!lead.phone && !lead.email && !lead.linkedinUrl ? (
            <View style={styles.detailRow}>
              <Feather name="info" size={15} color={colors.mutedForeground} />
              <Text style={[styles.detailValue, { color: colors.mutedForeground }]}>No contact info</Text>
            </View>
          ) : null}
        </View>

        {/* Notes */}
        {lead.notes ? (
          <View style={[styles.notesCard, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
            <Text style={[styles.notesLabel, { color: colors.mutedForeground }]}>Notes</Text>
            <Text style={[styles.notesText, { color: colors.foreground }]}>{lead.notes}</Text>
          </View>
        ) : null}

        </ScrollView>
      </View>

      {/* Single-lead email compose */}
      <SingleEmailComposeModal
        lead={lead}
        visible={emailComposeVisible}
        initialSubject={emailComposeSubject}
        initialBody={emailComposeBody}
        colors={colors}
        insets={insets}
        onClose={() => setEmailComposeVisible(false)}
        onSent={() => showLog('email', 'Email')}
      />

      {/* Log prompt overlay */}
      {logPrompt ? (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={StyleSheet.absoluteFill}
          pointerEvents="box-none"
        >
          <Pressable
            style={styles.logBackdrop}
            onPress={() => setLogPrompt(null)}
          />
          <View style={[styles.logCard, { backgroundColor: colors.card, borderColor: colors.border, paddingBottom: insets.bottom + 20 }]}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
            {/* Title row */}
            <View style={styles.logHeader}>
              <View style={[styles.logIconWrap, { backgroundColor: colors.primary + '1A' }]}>
                <Feather
                  name={logPrompt.type === 'call' ? 'phone' : logPrompt.type === 'email' ? 'mail' : 'linkedin'}
                  size={18}
                  color={colors.primary}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.logTitle, { color: colors.foreground }]}>
                  Log {logPrompt.label}
                </Text>
                <Text style={[styles.logSub, { color: colors.mutedForeground }]}>
                  Add a note (optional)
                </Text>
              </View>
              <TouchableOpacity onPress={() => setLogPrompt(null)} hitSlop={12}>
                <Feather name="x" size={18} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            {/* Note input */}
            <TextInput
              style={[styles.logInput, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground }]}
              placeholder="e.g. Left voicemail, discussed pricing…"
              placeholderTextColor={colors.mutedForeground}
              value={logNote}
              onChangeText={setLogNote}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              autoFocus
            />

            {/* Buttons */}
            <View style={styles.logActions}>
              <TouchableOpacity
                style={[styles.logSkipBtn, { borderColor: colors.border }]}
                onPress={() => setLogPrompt(null)}
                activeOpacity={0.75}
              >
                <Text style={[styles.logSkipText, { color: colors.mutedForeground }]}>Skip</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.logSubmitBtn, { backgroundColor: colors.primary }]}
                onPress={() => {
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  onLogAction(logPrompt.type, logNote.trim());
                  setLogPrompt(null);
                }}
                activeOpacity={0.8}
              >
                <Feather name="check" size={15} color="#fff" />
                <Text style={styles.logSubmitText}>Log {logPrompt.label}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      ) : null}
    </Modal>
  );
}

// ── Apollo Import Modal ───────────────────────────────────────────────────────

function ApolloImportModal({
  visible,
  colors,
  insets,
  onClose,
  onImported,
}: {
  visible: boolean;
  colors: ReturnType<typeof useColors>;
  insets: { top: number; bottom: number };
  onClose: () => void;
  onImported: () => void;
}) {
  const [csvText, setCsvText] = useState('');
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<{ processed: number; total: number } | null>(null);

  const productsQ = useQuery({
    queryKey: ['products'],
    queryFn: fetchProducts,
    enabled: visible,
  });
  const products = productsQ.data ?? [];

  const handleImport = useCallback(async () => {
    if (!csvText.trim() || importing) return;
    setImporting(true);
    setProgress(null);
    try {
      const result = await importApolloMobile(csvText.trim(), selectedProductId, (processed, total) => {
        setProgress({ processed, total });
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onImported();
      const msg =
        `Imported ${result.imported} lead${result.imported !== 1 ? 's' : ''}` +
        (result.updated > 0 ? `, updated ${result.updated}` : '');
      Alert.alert('Import complete', msg);
      setCsvText('');
      setSelectedProductId(null);
      setProgress(null);
      onClose();
    } catch (err) {
      Alert.alert('Import failed', err instanceof Error ? err.message : 'Check your CSV format and try again.');
    } finally {
      setImporting(false);
    }
  }, [csvText, selectedProductId, importing, onImported, onClose]);

  const handleClose = useCallback(() => {
    if (importing) return;
    setCsvText('');
    setSelectedProductId(null);
    setProgress(null);
    onClose();
  }, [importing, onClose]);

  const canImport = csvText.trim().length > 0 && !importing;
  const progressPct = progress && progress.total > 0 ? progress.processed / progress.total : 0;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        style={[importStyles.root, { backgroundColor: colors.background }]}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Header */}
        <View style={[importStyles.header, { borderBottomColor: colors.border, paddingTop: insets.top + 16 }]}>
          <TouchableOpacity onPress={handleClose} hitSlop={8} disabled={importing}>
            <Text style={[importStyles.cancelText, { color: importing ? colors.border : colors.mutedForeground }]}>
              Cancel
            </Text>
          </TouchableOpacity>
          <Text style={[importStyles.modalTitle, { color: colors.foreground }]}>Import CSV</Text>
          <TouchableOpacity onPress={handleImport} hitSlop={8} disabled={!canImport}>
            {importing ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Text style={[importStyles.importHeaderText, { color: canImport ? colors.primary : colors.border }]}>
                Import
              </Text>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView
          style={importStyles.scroll}
          contentContainerStyle={[importStyles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Instructions */}
          <View style={[importStyles.infoBox, { backgroundColor: colors.primary + '10', borderColor: colors.primary + '30' }]}>
            <Feather name="info" size={14} color={colors.primary} />
            <Text style={[importStyles.infoText, { color: colors.mutedForeground }]}>
              Export contacts from Apollo.io as a CSV, then paste the entire file contents below.
            </Text>
          </View>

          {/* Product picker */}
          <Text style={[importStyles.sectionLabel, { color: colors.mutedForeground }]}>ASSIGN TO PRODUCT</Text>
          <View style={[importStyles.productList, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <TouchableOpacity
              style={[
                importStyles.productRow,
                { borderBottomColor: colors.border },
                selectedProductId === null && { backgroundColor: colors.primary + '12' },
              ]}
              onPress={() => setSelectedProductId(null)}
              activeOpacity={0.75}
            >
              <View style={[importStyles.radioOuter, { borderColor: selectedProductId === null ? colors.primary : colors.border }]}>
                {selectedProductId === null && <View style={[importStyles.radioInner, { backgroundColor: colors.primary }]} />}
              </View>
              <Text style={[importStyles.productName, { color: colors.mutedForeground }]}>No product</Text>
            </TouchableOpacity>
            {products.map((p, idx) => (
              <TouchableOpacity
                key={p.id}
                style={[
                  importStyles.productRow,
                  idx < products.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                  selectedProductId === p.id && { backgroundColor: colors.primary + '12' },
                ]}
                onPress={() => setSelectedProductId(p.id)}
                activeOpacity={0.75}
              >
                <View style={[importStyles.radioOuter, { borderColor: selectedProductId === p.id ? colors.primary : colors.border }]}>
                  {selectedProductId === p.id && <View style={[importStyles.radioInner, { backgroundColor: colors.primary }]} />}
                </View>
                <Text style={[importStyles.productName, { color: colors.foreground }]}>{p.name}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* CSV paste area */}
          <Text style={[importStyles.sectionLabel, { color: colors.mutedForeground }]}>PASTE CSV</Text>
          <TextInput
            style={[
              importStyles.csvInput,
              { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground },
            ]}
            placeholder={'First Name,Last Name,Email,Company,Title,…\nJane,Doe,jane@acme.com,Acme,VP Sales,…'}
            placeholderTextColor={colors.mutedForeground}
            multiline
            textAlignVertical="top"
            value={csvText}
            onChangeText={setCsvText}
            editable={!importing}
            autoCorrect={false}
            autoCapitalize="none"
          />

          {/* Progress bar — shown only while importing */}
          {importing && (
            <View style={importStyles.progressSection}>
              <View style={[importStyles.progressTrack, { backgroundColor: colors.border }]}>
                <View
                  style={[
                    importStyles.progressFill,
                    { backgroundColor: colors.primary, width: `${Math.round(progressPct * 100)}%` as any },
                  ]}
                />
              </View>
              <Text style={[importStyles.progressText, { color: colors.mutedForeground }]}>
                {progress ? `Importing… ${progress.processed} / ${progress.total}` : 'Starting import…'}
              </Text>
            </View>
          )}

          {/* Bottom import button */}
          <TouchableOpacity
            style={[importStyles.importBtn, { backgroundColor: canImport ? colors.primary : colors.border }]}
            onPress={handleImport}
            disabled={!canImport}
            activeOpacity={0.8}
          >
            {importing ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Feather name="upload" size={16} color="#fff" />
                <Text style={importStyles.importBtnText}>Import leads</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const importStyles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  cancelText: {
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
    minWidth: 56,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
  },
  importHeaderText: {
    fontSize: 16,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
    minWidth: 56,
    textAlign: 'right',
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    marginBottom: 8,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    lineHeight: 18,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 0.8,
    marginBottom: 8,
    marginTop: 20,
  },
  productList: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  radioOuter: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  productName: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
  },
  csvInput: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    minHeight: 160,
    lineHeight: 18,
  },
  progressSection: {
    marginTop: 16,
    gap: 8,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressText: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
  },
  importBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 24,
  },
  importBtnText: {
    fontSize: 15,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
    color: '#fff',
  },
});

// ── Main screen ───────────────────────────────────────────────────────────────

export default function LeadsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<LeadStatus | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<LeadTypeFilter>('all');
  // Track whether the persisted filter has been loaded so we don't overwrite
  // storage with defaults before the initial async read completes.
  const filterLoadedRef = useRef(false);

  // Restore persisted search/filter on mount
  useEffect(() => {
    loadLeadsFilter().then((saved) => {
      setSearchQuery(saved.searchQuery);
      setStatusFilter(saved.statusFilter);
      setTypeFilter(saved.typeFilter);
      filterLoadedRef.current = true;
    });
  }, []);

  // Persist search/filter whenever they change (after initial load)
  useEffect(() => {
    if (!filterLoadedRef.current) return;
    saveLeadsFilter({ searchQuery, statusFilter, typeFilter });
  }, [searchQuery, statusFilter, typeFilter]);
  const [showAddLead, setShowAddLead] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [sortOrder, setSortOrder] = useState<'recent' | 'name' | 'status'>('recent');

  // Multi-select state
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showBulkModal, setShowBulkModal] = useState(false);

  const leadsQ = useQuery({
    queryKey: ['leads'],
    queryFn: fetchLeads,
  });
  const leads = leadsQ.data ?? [];

  // Refetch whenever this tab comes back into focus so web-side edits
  // (e.g. a lead-type change) are immediately visible without a manual pull-to-refresh.
  useFocusEffect(
    useCallback(() => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
    }, [queryClient])
  );

  const filteredLeads = useMemo(() => {
    let result = leads;
    if (statusFilter !== 'all') {
      result = result.filter((l) => l.status === statusFilter);
    }
    if (typeFilter !== 'all') {
      result = result.filter((l) => l.leadType === typeFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      const fullName = (l: Lead) =>
        [l.firstName, l.lastName].filter(Boolean).join(' ');
      result = result.filter((l) =>
        [fullName(l), l.firstName, l.lastName, l.email, l.company, l.title]
          .filter(Boolean)
          .some((v) => v!.toLowerCase().includes(q))
      );
    }
    // Sort
    result = [...result];
    if (sortOrder === 'recent') {
      result.sort((a, b) => {
        const ta = a.lastActionAt ? new Date(a.lastActionAt).getTime() : new Date(a.createdAt).getTime();
        const tb = b.lastActionAt ? new Date(b.lastActionAt).getTime() : new Date(b.createdAt).getTime();
        return tb - ta;
      });
    } else if (sortOrder === 'name') {
      result.sort((a, b) => {
        const na = [a.firstName, a.lastName].filter(Boolean).join(' ').toLowerCase();
        const nb = [b.firstName, b.lastName].filter(Boolean).join(' ').toLowerCase();
        return na.localeCompare(nb);
      });
    } else if (sortOrder === 'status') {
      result.sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status));
    }
    return result;
  }, [leads, statusFilter, searchQuery, sortOrder]);

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: LeadStatus }) =>
      patchLead(id, { status }),
    onSuccess: (updated) => {
      queryClient.setQueryData<Lead[]>(['leads'], (old) =>
        old ? old.map((l) => (l.id === updated.id ? updated : l)) : old
      );
      setSelectedLead((prev) => (prev?.id === updated.id ? updated : prev));
    },
  });

  const leadTypeMutation = useMutation({
    mutationFn: ({ id, leadType }: { id: number; leadType: LeadType | null }) =>
      patchLead(id, { leadType }),
    onSuccess: (updated) => {
      queryClient.setQueryData<Lead[]>(['leads'], (old) =>
        old ? old.map((l) => (l.id === updated.id ? updated : l)) : old
      );
      setSelectedLead((prev) => (prev?.id === updated.id ? updated : prev));
    },
  });

  const logMutation = useMutation({
    mutationFn: ({ id, type, note }: { id: number; type: string; note: string }) =>
      logLeadAction(id, type, note),
    onSuccess: (updated) => {
      queryClient.setQueryData<Lead[]>(['leads'], (old) =>
        old ? old.map((l) => (l.id === updated.id ? updated : l)) : old
      );
      setSelectedLead((prev) => (prev?.id === updated.id ? updated : prev));
    },
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['leads'] });
    setRefreshing(false);
  }, [queryClient]);

  // Enter/exit select mode
  const enterSelectMode = useCallback((leadId: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectMode(true);
    setSelectedIds(new Set([leadId]));
  }, []);

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
  }, []);

  const toggleSelect = useCallback((leadId: number) => {
    Haptics.selectionAsync();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(leadId)) {
        next.delete(leadId);
      } else {
        next.add(leadId);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    Haptics.selectionAsync();
    setSelectedIds(new Set(filteredLeads.map((l) => l.id)));
  }, [filteredLeads]);

  const handleBulkSend = useCallback(async (payload: {
    templateId: number | null;
    subject: string;
    body: string;
    scheduledFor: string;
  }) => {
    try {
      const result = await bulkScheduleEmail({
        leadIds: Array.from(selectedIds),
        ...payload,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowBulkModal(false);
      exitSelectMode();
      const noEmailSkipped = result.skipped - result.duplicates;
      const skipParts: string[] = [];
      if (result.duplicates > 0) skipParts.push(`${result.duplicates} already scheduled`);
      if (noEmailSkipped > 0) skipParts.push(`${noEmailSkipped} no email address`);
      Alert.alert(
        'Emails Scheduled',
        `${result.scheduled} email${result.scheduled !== 1 ? 's' : ''} scheduled successfully.` +
          (skipParts.length > 0 ? ` ${result.skipped} lead${result.skipped !== 1 ? 's' : ''} skipped — ${skipParts.join(', ')}.` : ''),
        [{ text: 'OK' }]
      );
    } catch {
      Alert.alert('Error', 'Failed to schedule emails. Please try again.');
    }
  }, [selectedIds, exitSelectMode]);

  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const selectedCount = selectedIds.size;

  return (
    <>
      <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        style={styles.root}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: topInset + 16,
            paddingBottom: insets.bottom + (selectMode ? 100 : 40),
          },
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
        {/* Title + select mode controls */}
        <View style={styles.titleRow}>
          <Text style={[styles.screenTitle, { color: colors.foreground }]}>Leads</Text>
          {selectMode ? (
            <View style={styles.selectControls}>
              <TouchableOpacity
                onPress={selectAll}
                hitSlop={8}
                style={[styles.selectControlBtn, { backgroundColor: colors.primary + '18', borderColor: colors.primary + '44' }]}
              >
                <Text style={[styles.selectControlText, { color: colors.primary }]}>All</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={exitSelectMode}
                hitSlop={8}
                style={[styles.selectControlBtn, { backgroundColor: colors.secondary, borderColor: colors.border }]}
              >
                <Text style={[styles.selectControlText, { color: colors.mutedForeground }]}>Done</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.titleButtons}>
              <TouchableOpacity
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setShowImportModal(true);
                }}
                hitSlop={8}
                style={[styles.addLeadBtn, { backgroundColor: colors.mutedForeground + '18', borderColor: colors.mutedForeground + '44' }]}
              >
                <Feather name="upload" size={14} color={colors.mutedForeground} />
                <Text style={[styles.addLeadBtnText, { color: colors.mutedForeground }]}>Import</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setShowAddLead(true);
                }}
                hitSlop={8}
                style={[styles.addLeadBtn, { backgroundColor: colors.primary + '18', borderColor: colors.primary + '44' }]}
              >
                <Feather name="plus" size={16} color={colors.primary} />
                <Text style={[styles.addLeadBtnText, { color: colors.primary }]}>Add</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Search bar */}
        <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name="search" size={16} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            placeholder="Search by name, company, email…"
            placeholderTextColor={colors.mutedForeground}
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="while-editing"
          />
          {searchQuery.length > 0 && Platform.OS !== 'ios' && (
            <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={8}>
              <Feather name="x" size={16} color={colors.mutedForeground} />
            </TouchableOpacity>
          )}
        </View>

        {/* Status filter chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipsScroll}
          contentContainerStyle={styles.chipsContent}
        >
          {(['all', ...STATUS_ORDER] as const).map((s) => {
            const isActive = statusFilter === s;
            const color = s === 'all' ? colors.primary : STATUS_COLORS[s];
            const label = s === 'all' ? 'All' : STATUS_LABELS[s];
            const count = s === 'all' ? leads.length : leads.filter((l) => l.status === s).length;
            return (
              <TouchableOpacity
                key={s}
                onPress={() => {
                  Haptics.selectionAsync();
                  setStatusFilter(s);
                }}
                style={[
                  styles.chip,
                  {
                    backgroundColor: isActive ? color + '22' : colors.card,
                    borderColor: isActive ? color : colors.border,
                  },
                ]}
                activeOpacity={0.75}
              >
                <Text
                  style={[
                    styles.chipText,
                    { color: isActive ? color : colors.mutedForeground },
                  ]}
                >
                  {label}
                </Text>
                {count > 0 && (
                  <View style={[styles.chipBadge, { backgroundColor: isActive ? color : colors.border }]}>
                    <Text style={[styles.chipBadgeText, { color: isActive ? '#fff' : colors.mutedForeground }]}>
                      {count}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Lead type filter chips */}
        <View style={styles.typeFilterRow}>
          {([
            { value: 'all' as const, label: 'All Types' },
            { value: 'end_user' as const, label: 'End Users' },
            { value: 'reseller' as const, label: 'Resellers' },
          ]).map(({ value, label }) => {
            const isActive = typeFilter === value;
            const color = value === 'reseller' ? '#7C8CFF' : value === 'end_user' ? '#4DD4C1' : colors.primary;
            const count =
              value === 'all'
                ? leads.length
                : leads.filter((l) => l.leadType === value).length;
            return (
              <TouchableOpacity
                key={value}
                onPress={() => { Haptics.selectionAsync(); setTypeFilter(value); }}
                style={[
                  styles.typeFilterChip,
                  {
                    backgroundColor: isActive ? color + '22' : colors.card,
                    borderColor: isActive ? color : colors.border,
                  },
                ]}
                activeOpacity={0.75}
              >
                <Text style={[styles.typeFilterChipText, { color: isActive ? color : colors.mutedForeground }]}>
                  {label}
                </Text>
                {count > 0 && (
                  <View style={[styles.chipBadge, { backgroundColor: isActive ? color : colors.border }]}>
                    <Text style={[styles.chipBadgeText, { color: isActive ? '#fff' : colors.mutedForeground }]}>
                      {count}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Sort control */}
        <View style={styles.sortRow}>
          {(['recent', 'name', 'status'] as const).map((s) => {
            const isActive = sortOrder === s;
            const label = s === 'recent' ? 'Recent' : s === 'name' ? 'Name A–Z' : 'Status';
            const icon = s === 'recent' ? 'clock' : s === 'name' ? 'type' : 'tag';
            return (
              <TouchableOpacity
                key={s}
                onPress={() => { Haptics.selectionAsync(); setSortOrder(s); }}
                style={[
                  styles.sortChip,
                  {
                    backgroundColor: isActive ? colors.primary + '18' : colors.card,
                    borderColor: isActive ? colors.primary + '55' : colors.border,
                  },
                ]}
                activeOpacity={0.75}
              >
                <Feather name={icon as any} size={12} color={isActive ? colors.primary : colors.mutedForeground} />
                <Text style={[styles.sortChipText, { color: isActive ? colors.primary : colors.mutedForeground }]}>
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* List */}
        {leadsQ.isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 48 }} />
        ) : leads.length === 0 ? (
          <View style={[styles.emptyState, { borderColor: colors.border }]}>
            <Feather name="users" size={36} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No leads yet</Text>
            <Text style={[styles.emptySubText, { color: colors.mutedForeground }]}>
              Import leads from the web app to get started.
            </Text>
          </View>
        ) : filteredLeads.length === 0 ? (
          <View style={[styles.emptyState, { borderColor: colors.border }]}>
            <Feather name="search" size={36} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              {searchQuery.trim() ? `No results for "${searchQuery.trim()}"` : 'No leads match this filter'}
            </Text>
            <Text style={[styles.emptySubText, { color: colors.mutedForeground }]}>
              Try a different search or filter.
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {!selectMode && (
              <TouchableOpacity
                style={[styles.selectHint, { borderColor: colors.border }]}
                onPress={() => {
                  if (filteredLeads.length > 0) enterSelectMode(filteredLeads[0].id);
                }}
                activeOpacity={0.75}
              >
                <Feather name="check-square" size={14} color={colors.mutedForeground} />
                <Text style={[styles.selectHintText, { color: colors.mutedForeground }]}>
                  Long-press any lead to select for bulk email
                </Text>
              </TouchableOpacity>
            )}
            {filteredLeads.map((lead) => (
              <LeadRow
                key={lead.id}
                lead={lead}
                colors={colors}
                selectMode={selectMode}
                isSelected={selectedIds.has(lead.id)}
                onPress={() => {
                  if (selectMode) {
                    toggleSelect(lead.id);
                  } else {
                    Haptics.selectionAsync();
                    setSelectedLead(lead);
                  }
                }}
                onLongPress={() => {
                  if (!selectMode) {
                    enterSelectMode(lead.id);
                  }
                }}
              />
            ))}
          </View>
        )}
      </ScrollView>

      {/* Floating select-mode toolbar */}
      {selectMode && (
        <View
          style={[
            styles.selectToolbar,
            {
              backgroundColor: colors.card,
              borderTopColor: colors.border,
              paddingBottom: insets.bottom + 8,
            },
          ]}
        >
          <View style={styles.selectToolbarLeft}>
            <Text style={[styles.selectCount, { color: colors.foreground }]}>
              {selectedCount} selected
            </Text>
          </View>
          <TouchableOpacity
            style={[
              styles.sendEmailBtn,
              {
                backgroundColor: selectedCount > 0 ? colors.primary : colors.border,
              },
            ]}
            onPress={() => {
              if (selectedCount === 0) return;
              Haptics.selectionAsync();
              setShowBulkModal(true);
            }}
            disabled={selectedCount === 0}
            activeOpacity={0.8}
          >
            <Feather name="send" size={16} color={selectedCount > 0 ? '#fff' : colors.mutedForeground} />
            <Text style={[styles.sendEmailBtnText, { color: selectedCount > 0 ? '#fff' : colors.mutedForeground }]}>
              Send Email
            </Text>
          </TouchableOpacity>
        </View>
      )}

      </View>

      {selectedLead ? (
        <LeadDetailSheet
          lead={selectedLead}
          colors={colors}
          onClose={() => setSelectedLead(null)}
          onStatusChange={(status) => {
            statusMutation.mutate({ id: selectedLead.id, status });
          }}
          onLeadTypeChange={(leadType) => {
            leadTypeMutation.mutate({ id: selectedLead.id, leadType });
          }}
          onLogAction={(type, note) => {
            logMutation.mutate({ id: selectedLead.id, type, note });
          }}
        />
      ) : null}

      <AddLeadModal
        visible={showAddLead}
        colors={colors}
        insets={{ top: insets.top, bottom: insets.bottom }}
        onClose={() => setShowAddLead(false)}
        onCreated={(lead) => {
          queryClient.setQueryData<Lead[]>(['leads'], (old) => (old ? [lead, ...old] : [lead]));
          setShowAddLead(false);
        }}
      />

      <ApolloImportModal
        visible={showImportModal}
        colors={colors}
        insets={{ top: insets.top, bottom: insets.bottom }}
        onClose={() => setShowImportModal(false)}
        onImported={() => {
          queryClient.invalidateQueries({ queryKey: ['leads'] });
        }}
      />

      {showBulkModal && (
        <BulkEmailModal
          selectedLeadIds={Array.from(selectedIds)}
          selectedLeads={(leadsQ.data ?? []).filter(l => selectedIds.has(l.id))}
          selectedCount={selectedCount}
          colors={colors}
          insets={insets}
          onClose={() => setShowBulkModal(false)}
          onSend={handleBulkSend}
          onDeselectLeads={(ids) => {
            setSelectedIds(prev => {
              const next = new Set(prev);
              ids.forEach(id => next.delete(id));
              return next;
            });
          }}
        />
      )}
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 16, gap: 0 },

  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  screenTitle: {
    flex: 1,
    fontSize: 26,
    fontWeight: '700' as const,
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.5,
  },
  selectControls: {
    flexDirection: 'row',
    gap: 8,
  },
  selectControlBtn: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  selectControlText: {
    fontSize: 13,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
  },
  titleButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  addLeadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  addLeadBtnText: {
    fontSize: 13,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
  },

  // Search bar
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    paddingVertical: 0,
  },

  // Filter chips
  chipsScroll: { marginBottom: 14 },
  chipsContent: { flexDirection: 'row', gap: 8, paddingRight: 4 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '500' as const,
    fontFamily: 'Inter_500Medium',
  },
  chipBadge: {
    borderRadius: 8,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  chipBadgeText: {
    fontSize: 10,
    fontWeight: '700' as const,
    fontFamily: 'Inter_700Bold',
  },

  // Lead type filter
  typeFilterRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  typeFilterChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 7,
    paddingHorizontal: 8,
  },
  typeFilterChipText: {
    fontSize: 12,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
  },

  // Sort control
  sortRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  sortChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  sortChipText: {
    fontSize: 12,
    fontWeight: '500' as const,
    fontFamily: 'Inter_500Medium',
  },

  // Summary
  summaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  summaryChip: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'center',
    minWidth: 60,
  },
  summaryNum: {
    fontSize: 18,
    fontWeight: '700' as const,
    fontFamily: 'Inter_700Bold',
  },
  summaryLbl: {
    fontSize: 10,
    fontFamily: 'Inter_400Regular',
    marginTop: 1,
  },

  // Select hint
  selectHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
  },
  selectHintText: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
  },

  // Lead rows
  list: { gap: 8 },
  leadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    gap: 12,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '700' as const,
    fontFamily: 'Inter_700Bold',
  },
  leadInfo: { flex: 1, gap: 3 },
  leadName: {
    fontSize: 14,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
  },
  leadSub: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
  },
  leadRight: { alignItems: 'flex-end', gap: 4 },

  // Status badge
  badge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
  },

  // Lead type badge (shown above status badge in lead row)
  leadTypeBadge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  leadTypeBadgeText: {
    fontSize: 10,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
  },

  // Empty state
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

  // Select toolbar
  selectToolbar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 12,
  },
  selectToolbarLeft: { flex: 1 },
  selectCount: {
    fontSize: 15,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
  },
  sendEmailBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  sendEmailBtnText: {
    fontSize: 14,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
  },

  // Detail sheet
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    maxHeight: '85%',
  },
  bulkSheet: {
    maxHeight: '92%',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    marginBottom: 20,
  },
  sheetAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  sheetAvatarText: {
    fontSize: 22,
    fontWeight: '700' as const,
    fontFamily: 'Inter_700Bold',
  },
  sheetHeaderInfo: { flex: 1, gap: 3 },
  sheetName: {
    fontSize: 18,
    fontWeight: '700' as const,
    fontFamily: 'Inter_700Bold',
  },
  sheetTitle: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
  },
  sheetCompany: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
  },
  sheetClose: { padding: 4 },

  // Status picker
  sheetSection: { marginBottom: 16 },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },
  statusRowLabel: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
    fontWeight: '500' as const,
  },
  statusPicker: {
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 4,
    overflow: 'hidden',
  },
  statusOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  statusOptionText: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
  },

  // Action buttons
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  actionBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 14,
  },
  actionBtnLabel: {
    fontSize: 12,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
  },

  // Detail card
  detailCard: {
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
    overflow: 'hidden',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  detailValue: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
  },

  // Log prompt
  logBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
  },
  logCard: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 16,
  },
  logHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  logIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  logTitle: {
    fontSize: 15,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
  },
  logSub: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    marginTop: 2,
  },
  logInput: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    minHeight: 76,
  },
  logActions: {
    flexDirection: 'row',
    gap: 10,
  },
  logSkipBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 12,
  },
  logSkipText: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
    fontWeight: '500' as const,
  },
  logSubmitBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 10,
    paddingVertical: 12,
  },
  logSubmitText: {
    fontSize: 14,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
    color: '#fff',
  },

  // Notes
  notesCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    gap: 6,
    marginBottom: 4,
  },
  notesLabel: {
    fontSize: 11,
    fontFamily: 'Inter_500Medium',
    fontWeight: '500' as const,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  notesText: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    lineHeight: 19,
  },

  // AI assistant
  aiSection: { marginBottom: 16 },
  aiBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  aiBtnText: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
    fontWeight: '500' as const,
  },
  aiPanel: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginTop: 8,
    gap: 0,
  },
  aiPanelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  aiPanelMuted: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
  },
  aiRetryText: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    fontWeight: '500' as const,
  },
  aiApproachText: {
    fontSize: 12,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
  },
  aiFieldLabel: {
    fontSize: 10,
    fontFamily: 'Inter_600SemiBold',
    fontWeight: '600' as const,
    letterSpacing: 0.8,
  },
  aiOpenerText: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    fontStyle: 'italic',
    lineHeight: 19,
  },
  aiMessageText: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    lineHeight: 19,
    opacity: 0.85,
  },
  aiSubjectText: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    fontWeight: '500' as const,
    lineHeight: 19,
  },
  aiActionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  aiActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 10,
  },
  aiActionBtnText: {
    fontSize: 13,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
  },

  // Bulk email modal
  bulkHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
  },
  bulkIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  bulkTitle: {
    fontSize: 17,
    fontWeight: '700' as const,
    fontFamily: 'Inter_700Bold',
  },
  bulkSub: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    marginTop: 1,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  templateList: { gap: 8, marginBottom: 4 },
  templateCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 6,
  },
  templateCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  templateName: {
    fontSize: 14,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
  },
  templateSubject: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    marginTop: 1,
  },
  templateCheck: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  templatePreview: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    lineHeight: 17,
  },
  emptyInline: {
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    padding: 24,
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  emptyInlineText: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
  },
  customInput: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    marginBottom: 8,
  },
  customBody: {
    minHeight: 88,
    textAlignVertical: 'top',
  },
  presetRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  presetChip: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  presetChipText: {
    fontSize: 13,
    fontWeight: '500' as const,
    fontFamily: 'Inter_500Medium',
  },
  iosPickerWrap: {
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 8,
    overflow: 'hidden',
  },
  androidCustomSummary: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  androidCustomSummaryText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500' as const,
    fontFamily: 'Inter_500Medium',
  },
  bulkActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  bulkCancelBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 13,
  },
  bulkCancelText: {
    fontSize: 14,
    fontWeight: '500' as const,
    fontFamily: 'Inter_500Medium',
  },
  bulkSendBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    paddingVertical: 13,
  },
  bulkSendText: {
    fontSize: 14,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
    color: '#fff',
  },

  // Confirm step
  confirmContent: { gap: 12 },
  confirmCard: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  confirmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderBottomWidth: 1,
  },
  confirmLabel: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
  },
  confirmValue: {
    fontSize: 13,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
    maxWidth: '55%',
    textAlign: 'right',
  },
  confirmWindowEnd: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    marginTop: 2,
  },
  confirmNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
  },
  confirmNoteText: {
    flex: 1,
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    lineHeight: 17,
  },
  recencyBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
  },
  recencyText: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    lineHeight: 17,
  },
  recencyLeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  recencyLeadText: {
    flex: 1,
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    lineHeight: 15,
  },
  recencyDeselect: {
    marginTop: 6,
  },
  recencyDeselectText: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    textDecorationLine: 'underline',
  },
});

const singleEmailStyles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  cancelBtn: { minWidth: 60 },
  cancelText: { fontSize: 16, fontFamily: 'Inter_400Regular' },
  title: { fontSize: 17, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold' },
  sendBtn: { minWidth: 60, alignItems: 'flex-end' },
  sendText: { fontSize: 16, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold' },
  body: { paddingHorizontal: 20, paddingTop: 20, gap: 12 },
  toRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  toLabel: { fontSize: 13, fontFamily: 'Inter_500Medium', fontWeight: '500' as const, width: 32 },
  toValue: { flex: 1, fontSize: 13, fontFamily: 'Inter_400Regular' },
  fieldCard: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 6,
  },
  fieldLabel: { fontSize: 11, fontFamily: 'Inter_500Medium', fontWeight: '500' as const, textTransform: 'uppercase', letterSpacing: 0.6 },
  subjectInput: { fontSize: 15, fontFamily: 'Inter_400Regular', paddingVertical: 0 },
  bodyInput: { fontSize: 14, fontFamily: 'Inter_400Regular', minHeight: 140, paddingVertical: 0 },
  scheduleLabel: { fontSize: 11, fontFamily: 'Inter_500Medium', fontWeight: '500' as const, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 4 },
  presetRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  presetBtn: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  presetText: { fontSize: 13, fontFamily: 'Inter_500Medium', fontWeight: '500' as const },
  sendPrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    paddingVertical: 16,
    marginTop: 8,
  },
  sendPrimaryText: { fontSize: 16, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold', color: '#fff' },
});
