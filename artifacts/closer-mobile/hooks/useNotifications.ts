/**
 * Pipeline review notification scheduling.
 *
 * Module-level functions are callable anywhere (auth context, components)
 * without being tied to a specific screen's lifecycle.
 *
 * Design choices:
 * - Only future-dated reviews get scheduled notifications. Overdue/today
 *   reviews are already surfaced on the Today screen; firing an immediate
 *   notification every time the app opens would spam the user.
 * - `scheduleIfAllowed` checks both the OS permission status and the user's
 *   persisted preference before scheduling. Call this from the auth layer
 *   on login/startup.
 * - Disabling reminders via the toggle cancels all scheduled review
 *   notifications immediately and persists the preference.
 * - Logout cancels all scheduled review notifications so no PII remains
 *   on the lock screen after sign-out.
 */
import { useState, useEffect, useCallback } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { listProducts, listPipelineDeals } from '@workspace/api-client-react';

// Configure foreground notification presentation
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

const SCHEDULING_PREF_KEY = 'closer_review_reminders_enabled';
const NOTIFICATION_DATA_TYPE = 'pipeline_review';

export type PermissionStatus = 'granted' | 'denied' | 'undetermined';

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

/**
 * Parse a "YYYY-MM-DD" date string as a **local** calendar date.
 * `new Date("YYYY-MM-DD")` parses as UTC midnight which shifts one day behind
 * in negative-UTC time zones. Constructing via (year, month-1, day) always
 * gives midnight in the device's local time zone.
 */
function parseLocalDate(dateStr: string): Date {
  const parts = dateStr.split('-');
  const year = Number(parts[0]);
  const month = Number(parts[1]) - 1; // 0-indexed
  const day = Number(parts[2]);
  return new Date(year, month, day);
}

// ---------------------------------------------------------------------------
// Module-level helpers — usable outside React render lifecycle
// ---------------------------------------------------------------------------

/** Cancel every scheduled notification that belongs to pipeline reviews. */
export async function cancelReviewNotifications(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const existing = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      existing
        .filter((n) => n.content.data?.type === NOTIFICATION_DATA_TYPE)
        .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier))
    );
  } catch {
    // best-effort
  }
}

/**
 * Fetch all products + pipeline deals and schedule one notification per deal
 * whose nextReviewDate is **in the future** (9 AM local time on that day).
 *
 * Overdue and today's reviews are intentionally skipped — they are already
 * visible on the Today screen. Firing immediate notifications on every
 * reschedule would spam the user.
 */
export async function scheduleReviewReminders(): Promise<void> {
  if (Platform.OS === 'web') return;

  try {
    // Cancel stale notifications before rescheduling
    await cancelReviewNotifications();

    const products = await listProducts();
    if (!products?.length) return;

    // Start of today (local) — reviews before this threshold are skipped
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    await Promise.all(
      products.map(async (product) => {
        try {
          const deals = await listPipelineDeals({ productId: product.id });
          if (!deals?.length) return;

          await Promise.all(
            deals.map(async (deal) => {
              if (!deal.nextReviewDate) return;

              // Parse as local date to avoid UTC offset day-shift
              const reviewDate = parseLocalDate(deal.nextReviewDate);

              // Only notify for genuinely future dates (tomorrow onwards).
              // Today and overdue deals are surfaced on the Today screen instead.
              if (reviewDate <= todayStart) return;

              // Schedule alert for 9 AM on the review date in device local time
              reviewDate.setHours(9, 0, 0, 0);

              await Notifications.scheduleNotificationAsync({
                content: {
                  title: `Pipeline Review: ${deal.contactName}`,
                  body: `${product.name} · ${stageLabel(deal.stage)} · $${Number(deal.value).toLocaleString()}`,
                  sound: true,
                  data: { type: NOTIFICATION_DATA_TYPE, dealId: deal.id },
                },
                trigger: {
                  type: Notifications.SchedulableTriggerInputTypes.DATE,
                  date: reviewDate,
                },
              });
            })
          );
        } catch {
          // skip products that fail; don't abort the rest
        }
      })
    );
  } catch {
    // scheduling is best-effort; never crash the caller
  }
}

/**
 * Check OS permission and user preference, then schedule reminders if both
 * are satisfied. Safe to call on login and app startup without extra guards.
 */
export async function scheduleIfAllowed(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const [permResult, storedPref] = await Promise.all([
      Notifications.getPermissionsAsync(),
      AsyncStorage.getItem(SCHEDULING_PREF_KEY),
    ]);
    const hasPermission = permResult.status === 'granted';
    // Default to enabled when preference has never been explicitly set
    const prefEnabled = storedPref === null || storedPref === 'true';
    if (hasPermission && prefEnabled) {
      await scheduleReviewReminders();
    }
  } catch {
    // best-effort
  }
}

// ---------------------------------------------------------------------------
// React hook — used by the Settings screen for permission UI
// ---------------------------------------------------------------------------

interface UseNotificationsReturn {
  permissionStatus: PermissionStatus;
  schedulingEnabled: boolean;
  requestPermissions: () => Promise<void>;
  toggleScheduling: () => Promise<void>;
}

export function useNotifications(): UseNotificationsReturn {
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus>('undetermined');
  const [schedulingEnabled, setSchedulingEnabled] = useState(true);

  // Restore persisted preference and current permission status on mount
  useEffect(() => {
    if (Platform.OS === 'web') return;

    (async () => {
      const [permResult, storedPref] = await Promise.all([
        Notifications.getPermissionsAsync(),
        AsyncStorage.getItem(SCHEDULING_PREF_KEY),
      ]);
      setPermissionStatus(mapStatus(permResult.status));
      if (storedPref !== null) {
        setSchedulingEnabled(storedPref === 'true');
      }
    })();
  }, []);

  const requestPermissions = useCallback(async () => {
    if (Platform.OS === 'web') return;
    const result = await Notifications.requestPermissionsAsync();
    const status = mapStatus(result.status);
    setPermissionStatus(status);
    if (status === 'granted') {
      await AsyncStorage.setItem(SCHEDULING_PREF_KEY, 'true');
      setSchedulingEnabled(true);
      await scheduleReviewReminders();
    }
  }, []);

  const toggleScheduling = useCallback(async () => {
    const next = !schedulingEnabled;
    setSchedulingEnabled(next);
    await AsyncStorage.setItem(SCHEDULING_PREF_KEY, String(next));

    if (!next) {
      // Disabling — cancel all scheduled review notifications immediately
      await cancelReviewNotifications();
    } else if (permissionStatus === 'granted') {
      // Re-enabling — reschedule immediately
      await scheduleReviewReminders();
    }
  }, [schedulingEnabled, permissionStatus]);

  return {
    permissionStatus,
    schedulingEnabled,
    requestPermissions,
    toggleScheduling,
  };
}

function mapStatus(status: string): PermissionStatus {
  if (status === 'granted') return 'granted';
  if (status === 'denied') return 'denied';
  return 'undetermined';
}

function stageLabel(stage: string): string {
  const labels: Record<string, string> = {
    prospect: 'Prospect',
    qualified: 'Qualified',
    proposal: 'Proposal',
    negotiation: 'Negotiation',
    closed_won: 'Won',
    closed_lost: 'Lost',
  };
  return labels[stage] ?? stage;
}
