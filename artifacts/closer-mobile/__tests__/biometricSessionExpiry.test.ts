/**
 * Biometric login — expired server session
 *
 * Scenario:
 *   1. User previously logged in; a session token is stored in SecureStore.
 *   2. The server session has since expired (server restart, TTL, etc.).
 *   3. User opens the app and taps "Sign in with Face ID / Fingerprint".
 *   4. Biometric challenge succeeds on-device.
 *   5. runBiometricLogin() validates the token against the server.
 *   6. Server returns no user (session gone).
 *
 * Expected outcomes:
 *   a. A human-readable "session expired" error is thrown.
 *   b. The stale token is deleted from SecureStore (biometric button disappears).
 *   c. The stale token is removed from AsyncStorage.
 *   d. setHasBiometricSession(false) is called (hides the biometric button).
 *   e. The in-memory session token is cleared.
 *   f. If the user merely cancels the biometric prompt, the token is preserved.
 *
 * We test the exported `runBiometricLogin` function from AuthContext directly —
 * the same function the AuthProvider hook delegates to — so the assertions
 * track the production code exactly.
 */

// ─── Module mocks ─────────────────────────────────────────────────────────────
// Must be declared before the imports they shadow.

jest.mock('expo-secure-store');
jest.mock('expo-local-authentication');
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('@workspace/api-client-react');
jest.mock('@/hooks/useNotifications', () => ({
  scheduleIfAllowed: jest.fn().mockResolvedValue(undefined),
  cancelReviewNotifications: jest.fn().mockResolvedValue(undefined),
}));

// ─── Imports ─────────────────────────────────────────────────────────────────

import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getCurrentAuthUser } from '@workspace/api-client-react';

// The function under test — the actual production implementation
import {
  runBiometricLogin,
  getSessionToken,
  setSessionToken,
  SESSION_KEY,
  SECURE_SESSION_KEY,
} from '../contexts/AuthContext';

// ─── Typed mock helpers ───────────────────────────────────────────────────────

const mockSecureStore = jest.mocked(SecureStore);
const mockLocalAuth = jest.mocked(LocalAuthentication);
const mockGetCurrentAuthUser = jest.mocked(getCurrentAuthUser);

// ─── Test data ───────────────────────────────────────────────────────────────

const STALE_TOKEN = 'stale-session-id-abc123';
const VALID_USER = { id: 1, email: 'rep@example.com', name: 'Rep', role: 'member' };

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  setSessionToken(null);

  // Device supports Face ID
  mockLocalAuth.hasHardwareAsync.mockResolvedValue(true);
  mockLocalAuth.isEnrolledAsync.mockResolvedValue(true);
  mockLocalAuth.supportedAuthenticationTypesAsync.mockResolvedValue([
    LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION,
  ]);

  // A stale token is on the device
  mockSecureStore.getItemAsync.mockResolvedValue(STALE_TOKEN);
  mockSecureStore.deleteItemAsync.mockResolvedValue(undefined);
  mockSecureStore.setItemAsync.mockResolvedValue(undefined);

  // Server reports session expired (default for most tests)
  mockGetCurrentAuthUser.mockResolvedValue({ user: null } as any);
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('runBiometricLogin — expired server session', () => {
  it('throws a clear "session expired" error when the server no longer recognises the token', async () => {
    mockLocalAuth.authenticateAsync.mockResolvedValue({ success: true } as any);

    await expect(
      runBiometricLogin(jest.fn(), jest.fn()),
    ).rejects.toThrow('Your session has expired. Please sign in with your password.');
  });

  it('deletes the stale token from SecureStore after an expired-session failure', async () => {
    mockLocalAuth.authenticateAsync.mockResolvedValue({ success: true } as any);

    await expect(runBiometricLogin(jest.fn(), jest.fn())).rejects.toThrow();

    expect(mockSecureStore.deleteItemAsync).toHaveBeenCalledWith(SECURE_SESSION_KEY);
  });

  it('removes the stale token from AsyncStorage after an expired-session failure', async () => {
    mockLocalAuth.authenticateAsync.mockResolvedValue({ success: true } as any);

    await expect(runBiometricLogin(jest.fn(), jest.fn())).rejects.toThrow();

    expect(AsyncStorage.removeItem).toHaveBeenCalledWith(SESSION_KEY);
  });

  it('calls setHasBiometricSession(false) so the biometric button is hidden after expiry', async () => {
    mockLocalAuth.authenticateAsync.mockResolvedValue({ success: true } as any);

    const setHasBiometricSession = jest.fn();
    await expect(
      runBiometricLogin(jest.fn(), setHasBiometricSession),
    ).rejects.toThrow();

    expect(setHasBiometricSession).toHaveBeenCalledWith(false);
  });

  it('clears the in-memory session token so it cannot be silently reused', async () => {
    setSessionToken(STALE_TOKEN); // prime the module-level token

    mockLocalAuth.authenticateAsync.mockResolvedValue({ success: true } as any);

    await expect(runBiometricLogin(jest.fn(), jest.fn())).rejects.toThrow();

    expect(getSessionToken()).toBeNull();
  });

  it('does NOT delete the token or call setHasBiometricSession when the user cancels', async () => {
    mockLocalAuth.authenticateAsync.mockResolvedValue({
      success: false,
      error: 'user_cancel',
    } as any);

    const setHasBiometricSession = jest.fn();
    await runBiometricLogin(jest.fn(), setHasBiometricSession); // must not throw

    expect(mockSecureStore.deleteItemAsync).not.toHaveBeenCalled();
    expect(AsyncStorage.removeItem).not.toHaveBeenCalled();
    expect(setHasBiometricSession).not.toHaveBeenCalled();
  });

  it('does NOT delete the token when cancelled by the system (e.g. Home button press)', async () => {
    mockLocalAuth.authenticateAsync.mockResolvedValue({
      success: false,
      error: 'system_cancel',
    } as any);

    await runBiometricLogin(jest.fn(), jest.fn()); // must not throw

    expect(mockSecureStore.deleteItemAsync).not.toHaveBeenCalled();
  });

  it('calls setUser with the authenticated user when the session is still valid', async () => {
    mockGetCurrentAuthUser.mockResolvedValue({ user: VALID_USER } as any);
    mockLocalAuth.authenticateAsync.mockResolvedValue({ success: true } as any);

    const setUser = jest.fn();
    await runBiometricLogin(setUser, jest.fn());

    expect(setUser).toHaveBeenCalledWith(VALID_USER);
    expect(mockSecureStore.deleteItemAsync).not.toHaveBeenCalled();
  });

  it('throws a device-side error (not "session expired") when biometric hardware fails', async () => {
    mockLocalAuth.authenticateAsync.mockResolvedValue({
      success: false,
      error: 'lockout',
    } as any);

    await expect(runBiometricLogin(jest.fn(), jest.fn())).rejects.toThrow(
      'Biometric authentication failed. Please sign in with your password.',
    );

    // Session should be intact — the failure was device-side, not server-side
    expect(mockSecureStore.deleteItemAsync).not.toHaveBeenCalled();
  });

  it('throws immediately without showing a biometric prompt if no token is stored', async () => {
    mockSecureStore.getItemAsync.mockResolvedValue(null);

    await expect(runBiometricLogin(jest.fn(), jest.fn())).rejects.toThrow(
      'No stored session found. Please sign in with your password first.',
    );

    expect(mockLocalAuth.authenticateAsync).not.toHaveBeenCalled();
  });

  it('writes the stored token to AsyncStorage before validating with the server', async () => {
    // Whether or not the server call succeeds, the token should be restored first
    mockGetCurrentAuthUser.mockResolvedValue({ user: VALID_USER } as any);
    mockLocalAuth.authenticateAsync.mockResolvedValue({ success: true } as any);

    await runBiometricLogin(jest.fn(), jest.fn());

    expect(AsyncStorage.setItem).toHaveBeenCalledWith(SESSION_KEY, STALE_TOKEN);
  });
});
