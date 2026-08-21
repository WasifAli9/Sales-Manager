import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import {
  getCurrentAuthUser,
  loginWithPassword,
  logoutSession,
  setAuthTokenGetter,
  setBaseUrl,
} from '@workspace/api-client-react';
import type { AuthUser } from '@workspace/api-client-react';
import {
  scheduleIfAllowed,
  cancelReviewNotifications,
} from '@/hooks/useNotifications';

// --------------------------------------------------------------------------
// Module-level bearer token — read by setAuthTokenGetter before every fetch
// --------------------------------------------------------------------------
let _sessionToken: string | null = null;
setAuthTokenGetter(() => _sessionToken);

// Exported for tests that need to inspect/reset the in-memory token.
export function getSessionToken(): string | null { return _sessionToken; }
export function setSessionToken(token: string | null): void { _sessionToken = token; }

export const SESSION_KEY = 'closer_session_token';
export const SECURE_SESSION_KEY = 'closer_biometric_session_token';

// --------------------------------------------------------------------------
// Exported biometric-login logic — dependency-injected so it can be unit-tested
// directly without a React renderer.  The AuthProvider hook simply delegates to
// this function passing its own state setters.
// --------------------------------------------------------------------------
export async function runBiometricLogin(
  setUser: (u: AuthUser | null) => void,
  setHasBiometricSession: (v: boolean) => void,
): Promise<void> {
  const storedSid = await SecureStore.getItemAsync(SECURE_SESSION_KEY);
  if (!storedSid) {
    throw new Error('No stored session found. Please sign in with your password first.');
  }

  const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
  const hasFaceId = types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION);
  const promptMessage = hasFaceId ? 'Sign in with Face ID' : 'Sign in with Touch ID';

  const result = await LocalAuthentication.authenticateAsync({
    promptMessage,
    fallbackLabel: 'Use password instead',
    cancelLabel: 'Cancel',
    disableDeviceFallback: false,
  });

  if (!result.success) {
    const reason = 'error' in result ? result.error : 'user_cancel';
    if (reason === 'user_cancel' || reason === 'system_cancel') {
      return;
    }
    throw new Error('Biometric authentication failed. Please sign in with your password.');
  }

  // Biometric verified — restore the session
  _sessionToken = storedSid;
  await AsyncStorage.setItem(SESSION_KEY, storedSid);

  // Validate the session is still active on the server
  const envelope = await getCurrentAuthUser();
  const authedUser = envelope.user ?? null;

  if (!authedUser) {
    // Session expired — clear secure store so we don't keep retrying
    _sessionToken = null;
    await AsyncStorage.removeItem(SESSION_KEY);
    await SecureStore.deleteItemAsync(SECURE_SESSION_KEY);
    setHasBiometricSession(false);
    throw new Error('Your session has expired. Please sign in with your password.');
  }

  setUser(authedUser);
  scheduleIfAllowed().catch(() => {});
}

// --------------------------------------------------------------------------
// Context
// --------------------------------------------------------------------------
interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  biometricsAvailable: boolean;
  hasBiometricSession: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithBiometrics: () => Promise<void>;
  logout: () => Promise<void>;
  disableBiometric: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isLoading: true,
  biometricsAvailable: false,
  hasBiometricSession: false,
  login: async () => {},
  loginWithBiometrics: async () => {},
  logout: async () => {},
  disableBiometric: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [biometricsAvailable, setBiometricsAvailable] = useState(false);
  const [hasBiometricSession, setHasBiometricSession] = useState(false);

  // Check biometric capability and stored secure session on mount
  useEffect(() => {
    (async () => {
      try {
        const [hasHardware, isEnrolled] = await Promise.all([
          LocalAuthentication.hasHardwareAsync(),
          LocalAuthentication.isEnrolledAsync(),
        ]);
        const canUseBiometrics = hasHardware && isEnrolled;
        setBiometricsAvailable(canUseBiometrics);

        if (canUseBiometrics) {
          const stored = await SecureStore.getItemAsync(SECURE_SESSION_KEY);
          setHasBiometricSession(!!stored);
        }
      } catch {
        // biometrics not available — silently fall through
      }
    })();
  }, []);

  // Restore token from storage on mount and fetch current user
  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(SESSION_KEY);
        if (stored) {
          _sessionToken = stored;
        }
        const envelope = await getCurrentAuthUser();
        const authedUser = envelope.user ?? null;
        setUser(authedUser);
        // Schedule review reminders at startup (gated on permission + preference)
        if (authedUser) {
          scheduleIfAllowed().catch(() => {});
        }
      } catch {
        setUser(null);
        _sessionToken = null;
        await AsyncStorage.removeItem(SESSION_KEY);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    // Use the typed generated client. The server returns LoginEnvelope { user, sid }.
    // `sid` is included in the JSON body because React Native's fetch does not
    // expose Set-Cookie response headers (forbidden header per the Fetch spec),
    // so cookie-based token capture is unreliable on native.
    const data = await loginWithPassword({ email, password });

    if (data.sid) {
      _sessionToken = data.sid;
      await AsyncStorage.setItem(SESSION_KEY, data.sid);
      // Also persist to SecureStore so biometric login can retrieve it later
      try {
        await SecureStore.setItemAsync(SECURE_SESSION_KEY, data.sid);
        setHasBiometricSession(true);
      } catch {
        // SecureStore not available on this device — non-fatal
      }
    }

    const authedUser = data.user ?? null;
    setUser(authedUser);
    // Schedule review reminders right after login (gated on permission + preference)
    if (authedUser) {
      scheduleIfAllowed().catch(() => {});
    }
  }, []);

  const loginWithBiometrics = useCallback(async () => {
    await runBiometricLogin(setUser, setHasBiometricSession);
  }, []);

  const disableBiometric = useCallback(async () => {
    try {
      await SecureStore.deleteItemAsync(SECURE_SESSION_KEY);
    } catch {
      // SecureStore not available — non-fatal
    }
    setHasBiometricSession(false);
  }, []);

  const logout = useCallback(async () => {
    // Cancel all scheduled review notifications before clearing session
    // so no PII (contact names, deal values) remains on the lock screen
    await cancelReviewNotifications();
    try {
      await logoutSession();
    } catch {
      // ignore
    }
    _sessionToken = null;
    await AsyncStorage.removeItem(SESSION_KEY);
    // Keep the secure store entry — the user may want biometric login next time
    // (the session will be invalid but loginWithBiometrics handles that gracefully)
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        biometricsAvailable,
        hasBiometricSession,
        login,
        loginWithBiometrics,
        logout,
        disableBiometric,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
