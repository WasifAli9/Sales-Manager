import AsyncStorage from '@react-native-async-storage/async-storage';

// ── Types ─────────────────────────────────────────────────────────────────────

export type LeadStatus = 'new' | 'contacted' | 'qualified' | 'not_interested' | 'converted';
export type StatusFilter = LeadStatus | 'all';
export type LeadTypeFilter = 'all' | 'end_user' | 'reseller';

export interface LeadsFilter {
  searchQuery: string;
  statusFilter: StatusFilter;
  typeFilter: LeadTypeFilter;
}

export const LEADS_FILTER_DEFAULTS: LeadsFilter = {
  searchQuery: '',
  statusFilter: 'all',
  typeFilter: 'all',
};

export const LEADS_FILTER_KEY = '@closer/leads_filter';

// ── Helpers ───────────────────────────────────────────────────────────────────

const VALID_STATUS_VALUES: StatusFilter[] = [
  'all',
  'new',
  'contacted',
  'qualified',
  'not_interested',
  'converted',
];

const VALID_TYPE_VALUES: LeadTypeFilter[] = ['all', 'end_user', 'reseller'];

function isValidStatusFilter(value: unknown): value is StatusFilter {
  return typeof value === 'string' && VALID_STATUS_VALUES.includes(value as StatusFilter);
}

function isValidTypeFilter(value: unknown): value is LeadTypeFilter {
  return typeof value === 'string' && VALID_TYPE_VALUES.includes(value as LeadTypeFilter);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Load the persisted leads filter from AsyncStorage.
 * Returns defaults on any failure (missing key, corrupt JSON, unexpected shape).
 * Never throws.
 */
export async function loadLeadsFilter(): Promise<LeadsFilter> {
  try {
    const raw = await AsyncStorage.getItem(LEADS_FILTER_KEY);
    if (raw === null) return { ...LEADS_FILTER_DEFAULTS };

    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) {
      return { ...LEADS_FILTER_DEFAULTS };
    }

    const obj = parsed as Record<string, unknown>;
    const searchQuery =
      typeof obj.searchQuery === 'string' ? obj.searchQuery : LEADS_FILTER_DEFAULTS.searchQuery;
    const statusFilter = isValidStatusFilter(obj.statusFilter)
      ? obj.statusFilter
      : LEADS_FILTER_DEFAULTS.statusFilter;
    const typeFilter = isValidTypeFilter(obj.typeFilter)
      ? obj.typeFilter
      : LEADS_FILTER_DEFAULTS.typeFilter;

    return { searchQuery, statusFilter, typeFilter };
  } catch {
    // Corrupt entry or AsyncStorage failure — use defaults
    return { ...LEADS_FILTER_DEFAULTS };
  }
}

/**
 * Persist the current filter to AsyncStorage.
 * Silently ignores write failures.
 */
export async function saveLeadsFilter(filter: LeadsFilter): Promise<void> {
  try {
    await AsyncStorage.setItem(LEADS_FILTER_KEY, JSON.stringify(filter));
  } catch {
    // Storage full or unavailable — best-effort only
  }
}

/**
 * Remove the persisted filter so the next launch starts with defaults.
 * Silently ignores failures.
 */
export async function clearLeadsFilter(): Promise<void> {
  try {
    await AsyncStorage.removeItem(LEADS_FILTER_KEY);
  } catch {
    // Ignore
  }
}
