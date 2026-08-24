import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as LocalAuthentication from 'expo-local-authentication';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/contexts/AuthContext';
import * as Haptics from 'expo-haptics';

export default function LoginScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { login, loginWithBiometrics, biometricsAvailable, hasBiometricSession } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Missing fields', 'Please enter your email and password.');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoading(true);
    try {
      await login(email.trim(), password);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Sign in failed. Check your credentials.';
      Alert.alert('Sign in failed', msg);
    } finally {
      setLoading(false);
    }
  };

  const handleBiometricLogin = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setBiometricLoading(true);
    try {
      await loginWithBiometrics();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Biometric sign in failed.';
      Alert.alert('Sign in failed', msg);
    } finally {
      setBiometricLoading(false);
    }
  };

  // Determine biometric button label based on enrolled types
  const getBiometricLabel = () => {
    // We can't await here in the render, so we use a simple platform heuristic.
    // The actual check happens inside loginWithBiometrics.
    if (Platform.OS === 'ios') {
      return 'Sign in with Face ID / Touch ID';
    }
    return 'Sign in with Fingerprint';
  };

  const getBiometricIcon = () => {
    if (Platform.OS === 'ios') return 'lock-open-outline';
    return 'finger-print-outline';
  };

  const showBiometricButton = biometricsAvailable && hasBiometricSession;

  const styles = makeStyles(colors, insets);

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.container}>
        {/* Logo / Brand */}
        <View style={styles.brandBlock}>
          <View style={styles.logoRing}>
            <Text style={styles.logoLetter}>C</Text>
          </View>
          <Text style={styles.brandName}>Sales Manager</Text>
          <Text style={styles.brandTagline}>Your sales command center</Text>
        </View>

        {/* Form */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Sign in</Text>

          {/* Biometric button — shown first when available */}
          {showBiometricButton && (
            <TouchableOpacity
              style={[styles.biometricButton, biometricLoading && styles.buttonDisabled]}
              onPress={handleBiometricLogin}
              disabled={biometricLoading || loading}
              activeOpacity={0.8}
            >
              {biometricLoading ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <>
                  <Ionicons
                    name={getBiometricIcon() as any}
                    size={20}
                    color={colors.primary}
                    style={styles.biometricIcon}
                  />
                  <Text style={styles.biometricButtonText}>{getBiometricLabel()}</Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {/* Divider between biometric and password form */}
          {showBiometricButton && (
            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or use password</Text>
              <View style={styles.dividerLine} />
            </View>
          )}

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
              editable={!loading && !biometricLoading}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor={colors.mutedForeground}
              secureTextEntry
              returnKeyType="go"
              onSubmitEditing={handleLogin}
              editable={!loading && !biometricLoading}
            />
          </View>

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading || biometricLoading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : (
              <Text style={styles.buttonText}>Sign in</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function makeStyles(colors: ReturnType<typeof useColors>, insets: { top: number; bottom: number }) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.background,
    },
    container: {
      flex: 1,
      justifyContent: 'center',
      paddingHorizontal: 24,
      paddingBottom: insets.bottom + 24,
      paddingTop: insets.top + (Platform.OS === 'web' ? 67 : 0),
    },
    brandBlock: {
      alignItems: 'center',
      marginBottom: 40,
    },
    logoRing: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 16,
    },
    logoLetter: {
      fontSize: 36,
      fontWeight: '700' as const,
      color: colors.primaryForeground,
      fontFamily: 'Inter_700Bold',
    },
    brandName: {
      fontSize: 28,
      fontWeight: '700' as const,
      color: colors.foreground,
      fontFamily: 'Inter_700Bold',
      letterSpacing: -0.5,
    },
    brandTagline: {
      fontSize: 14,
      color: colors.mutedForeground,
      fontFamily: 'Inter_400Regular',
      marginTop: 4,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      padding: 24,
      borderWidth: 1,
      borderColor: colors.border,
    },
    cardTitle: {
      fontSize: 20,
      fontWeight: '600' as const,
      color: colors.foreground,
      fontFamily: 'Inter_600SemiBold',
      marginBottom: 20,
    },
    biometricButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1.5,
      borderColor: colors.primary,
      borderRadius: colors.radius / 2,
      paddingVertical: 13,
      marginBottom: 4,
      backgroundColor: 'transparent',
    },
    biometricIcon: {
      marginRight: 8,
    },
    biometricButtonText: {
      fontSize: 15,
      fontWeight: '600' as const,
      color: colors.primary,
      fontFamily: 'Inter_600SemiBold',
    },
    dividerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginVertical: 16,
    },
    dividerLine: {
      flex: 1,
      height: 1,
      backgroundColor: colors.border,
    },
    dividerText: {
      fontSize: 12,
      color: colors.mutedForeground,
      fontFamily: 'Inter_400Regular',
      marginHorizontal: 12,
    },
    fieldGroup: {
      marginBottom: 16,
    },
    label: {
      fontSize: 13,
      fontWeight: '500' as const,
      color: colors.mutedForeground,
      fontFamily: 'Inter_500Medium',
      marginBottom: 6,
    },
    input: {
      backgroundColor: colors.secondary,
      borderRadius: colors.radius / 2,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      color: colors.foreground,
      fontFamily: 'Inter_400Regular',
    },
    button: {
      backgroundColor: colors.primary,
      borderRadius: colors.radius / 2,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: 8,
    },
    buttonDisabled: {
      opacity: 0.6,
    },
    buttonText: {
      fontSize: 15,
      fontWeight: '600' as const,
      color: colors.primaryForeground,
      fontFamily: 'Inter_600SemiBold',
    },
  });
}
