/**
 * Unit tests for leadsFilterStorage utilities.
 *
 * These tests run in Node with a lightweight AsyncStorage mock — no React
 * Native renderer required.  They cover the three scenarios called out in
 * the task:
 *   1. Filter state is correctly restored after a simulated app restart.
 *   2. Corrupt / missing AsyncStorage entries are handled gracefully.
 *   3. Clearing the filter removes the persisted value so it doesn't
 *      resurface on the next launch.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  LEADS_FILTER_KEY,
  LEADS_FILTER_DEFAULTS,
  loadLeadsFilter,
  saveLeadsFilter,
  clearLeadsFilter,
} from '../leadsFilterStorage';

// Cast to jest.Mocked so TypeScript knows each method carries Jest mock types
// (mockRejectedValueOnce, mockClear, etc.).  The real production type is not
// affected — this cast lives only inside the test file.
const storage = AsyncStorage as jest.Mocked<typeof AsyncStorage> & {
  __reset: () => void;
  __getStore: () => Record<string, string>;
};

beforeEach(() => {
  storage.__reset();
});

// ── loadLeadsFilter ───────────────────────────────────────────────────────────

describe('loadLeadsFilter', () => {
  it('returns defaults when storage is empty (simulates first launch)', async () => {
    const result = await loadLeadsFilter();
    expect(result).toEqual(LEADS_FILTER_DEFAULTS);
  });

  it('restores a valid saved filter (simulates app restart)', async () => {
    await AsyncStorage.setItem(
      LEADS_FILTER_KEY,
      JSON.stringify({ searchQuery: 'Acme', statusFilter: 'qualified' }),
    );

    const result = await loadLeadsFilter();
    expect(result.searchQuery).toBe('Acme');
    expect(result.statusFilter).toBe('qualified');
  });

  it('restores typeFilter when present', async () => {
    await AsyncStorage.setItem(
      LEADS_FILTER_KEY,
      JSON.stringify({ searchQuery: '', statusFilter: 'all', typeFilter: 'reseller' }),
    );

    const result = await loadLeadsFilter();
    expect(result.typeFilter).toBe('reseller');
  });

  it('defaults typeFilter to "all" when missing from stored object', async () => {
    await AsyncStorage.setItem(
      LEADS_FILTER_KEY,
      JSON.stringify({ searchQuery: 'jane', statusFilter: 'all' }),
    );

    const result = await loadLeadsFilter();
    expect(result.typeFilter).toBe('all');
  });

  it('ignores an unrecognised typeFilter and falls back to "all"', async () => {
    await AsyncStorage.setItem(
      LEADS_FILTER_KEY,
      JSON.stringify({ searchQuery: '', statusFilter: 'all', typeFilter: 'unknown_value' }),
    );

    const result = await loadLeadsFilter();
    expect(result.typeFilter).toBe('all');
  });

  it('restores a filter with only a searchQuery set, defaults statusFilter', async () => {
    await AsyncStorage.setItem(
      LEADS_FILTER_KEY,
      JSON.stringify({ searchQuery: 'jane' }),
    );

    const result = await loadLeadsFilter();
    expect(result.searchQuery).toBe('jane');
    expect(result.statusFilter).toBe(LEADS_FILTER_DEFAULTS.statusFilter);
  });

  it('restores a filter with only statusFilter set, defaults searchQuery', async () => {
    await AsyncStorage.setItem(
      LEADS_FILTER_KEY,
      JSON.stringify({ statusFilter: 'new' }),
    );

    const result = await loadLeadsFilter();
    expect(result.searchQuery).toBe(LEADS_FILTER_DEFAULTS.searchQuery);
    expect(result.statusFilter).toBe('new');
  });

  it('returns defaults and does NOT throw when JSON is corrupt', async () => {
    await AsyncStorage.setItem(LEADS_FILTER_KEY, '{ not valid json !!!');

    await expect(loadLeadsFilter()).resolves.toEqual(LEADS_FILTER_DEFAULTS);
  });

  it('returns defaults and does NOT throw when value is a JSON primitive', async () => {
    await AsyncStorage.setItem(LEADS_FILTER_KEY, '"just-a-string"');

    await expect(loadLeadsFilter()).resolves.toEqual(LEADS_FILTER_DEFAULTS);
  });

  it('returns defaults and does NOT throw when value is a JSON null', async () => {
    await AsyncStorage.setItem(LEADS_FILTER_KEY, 'null');

    await expect(loadLeadsFilter()).resolves.toEqual(LEADS_FILTER_DEFAULTS);
  });

  it('returns defaults and does NOT throw when value is an empty JSON object', async () => {
    await AsyncStorage.setItem(LEADS_FILTER_KEY, '{}');

    const result = await loadLeadsFilter();
    expect(result).toEqual(LEADS_FILTER_DEFAULTS);
  });

  it('ignores an unrecognised statusFilter value and falls back to "all"', async () => {
    await AsyncStorage.setItem(
      LEADS_FILTER_KEY,
      JSON.stringify({ searchQuery: '', statusFilter: 'deleted_in_v2' }),
    );

    const result = await loadLeadsFilter();
    expect(result.statusFilter).toBe('all');
  });

  it('returns defaults and does NOT throw when AsyncStorage.getItem rejects', async () => {
    storage.getItem.mockRejectedValueOnce(new Error('storage unavailable'));

    await expect(loadLeadsFilter()).resolves.toEqual(LEADS_FILTER_DEFAULTS);
  });

  it('returns a fresh copy of defaults (not a shared reference)', async () => {
    const a = await loadLeadsFilter();
    const b = await loadLeadsFilter();
    a.searchQuery = 'mutated';
    expect(b.searchQuery).toBe('');
  });
});

// ── saveLeadsFilter ───────────────────────────────────────────────────────────

describe('saveLeadsFilter', () => {
  it('writes searchQuery, statusFilter and typeFilter to storage', async () => {
    await saveLeadsFilter({ searchQuery: 'Bob', statusFilter: 'contacted', typeFilter: 'all' });

    const raw = await AsyncStorage.getItem(LEADS_FILTER_KEY);
    expect(JSON.parse(raw!)).toEqual({ searchQuery: 'Bob', statusFilter: 'contacted', typeFilter: 'all' });
  });

  it('round-trips through loadLeadsFilter', async () => {
    const filter = { searchQuery: 'TechCorp', statusFilter: 'converted' as const, typeFilter: 'reseller' as const };
    await saveLeadsFilter(filter);
    const loaded = await loadLeadsFilter();
    expect(loaded).toEqual(filter);
  });

  it('overwrites a previously saved filter', async () => {
    await saveLeadsFilter({ searchQuery: 'first', statusFilter: 'new', typeFilter: 'all' });
    await saveLeadsFilter({ searchQuery: 'second', statusFilter: 'qualified', typeFilter: 'end_user' });

    const loaded = await loadLeadsFilter();
    expect(loaded.searchQuery).toBe('second');
    expect(loaded.statusFilter).toBe('qualified');
    expect(loaded.typeFilter).toBe('end_user');
  });

  it('does NOT throw when AsyncStorage.setItem rejects', async () => {
    storage.setItem.mockRejectedValueOnce(new Error('disk full'));

    await expect(
      saveLeadsFilter({ searchQuery: 'x', statusFilter: 'all', typeFilter: 'all' }),
    ).resolves.toBeUndefined();
  });

  it('saving empty defaults causes next load to return defaults', async () => {
    // Simulate the user clearing the search bar — the persist effect saves
    // defaults so the next launch starts clean.
    await saveLeadsFilter({ searchQuery: '', statusFilter: 'all', typeFilter: 'all' });
    const loaded = await loadLeadsFilter();
    expect(loaded).toEqual(LEADS_FILTER_DEFAULTS);
  });
});

// ── clearLeadsFilter ──────────────────────────────────────────────────────────

describe('clearLeadsFilter', () => {
  it('removes the key so the next load returns defaults', async () => {
    await saveLeadsFilter({ searchQuery: 'Acme', statusFilter: 'new', typeFilter: 'reseller' });
    await clearLeadsFilter();

    const loaded = await loadLeadsFilter();
    expect(loaded).toEqual(LEADS_FILTER_DEFAULTS);
  });

  it('leaves storage without the key after clearing', async () => {
    await saveLeadsFilter({ searchQuery: 'x', statusFilter: 'qualified', typeFilter: 'end_user' });
    await clearLeadsFilter();

    expect(AsyncStorage.removeItem).toHaveBeenCalledWith(LEADS_FILTER_KEY);
    const raw = await AsyncStorage.getItem(LEADS_FILTER_KEY);
    expect(raw).toBeNull();
  });

  it('is idempotent — clearing an already-empty storage does not throw', async () => {
    await expect(clearLeadsFilter()).resolves.toBeUndefined();
    await expect(clearLeadsFilter()).resolves.toBeUndefined();
  });

  it('does NOT throw when AsyncStorage.removeItem rejects', async () => {
    storage.removeItem.mockRejectedValueOnce(new Error('storage error'));

    await expect(clearLeadsFilter()).resolves.toBeUndefined();
  });
});

// ── Integration: full restart simulation ─────────────────────────────────────

describe('full app-restart simulation', () => {
  it('filter survives a save → clear-mock → load cycle (restart)', async () => {
    // Step 1: user sets a filter before quitting the app
    await saveLeadsFilter({ searchQuery: 'Johnson', statusFilter: 'not_interested', typeFilter: 'reseller' });

    // Step 2: simulate app restart — reset in-memory mock counters but keep
    // the stored data (only __reset clears both; here we re-init manually).
    storage.getItem.mockClear();
    storage.setItem.mockClear();

    // Step 3: on next mount the component calls loadLeadsFilter
    const restored = await loadLeadsFilter();
    expect(restored.searchQuery).toBe('Johnson');
    expect(restored.statusFilter).toBe('not_interested');
    expect(restored.typeFilter).toBe('reseller');
  });

  it('clearing the filter before quit means next restart sees defaults', async () => {
    await saveLeadsFilter({ searchQuery: 'Acme', statusFilter: 'qualified', typeFilter: 'end_user' });
    // User clears the filter (or component saves defaults before quit)
    await clearLeadsFilter();

    // Simulate restart
    const restored = await loadLeadsFilter();
    expect(restored).toEqual(LEADS_FILTER_DEFAULTS);
  });

  it('all valid StatusFilter values survive a round-trip', async () => {
    const statuses = ['all', 'new', 'contacted', 'qualified', 'not_interested', 'converted'] as const;

    for (const statusFilter of statuses) {
      await saveLeadsFilter({ searchQuery: '', statusFilter, typeFilter: 'all' });
      const loaded = await loadLeadsFilter();
      expect(loaded.statusFilter).toBe(statusFilter);
    }
  });

  it('all valid LeadTypeFilter values survive a round-trip', async () => {
    const types = ['all', 'end_user', 'reseller'] as const;

    for (const typeFilter of types) {
      await saveLeadsFilter({ searchQuery: '', statusFilter: 'all', typeFilter });
      const loaded = await loadLeadsFilter();
      expect(loaded.typeFilter).toBe(typeFilter);
    }
  });
});
