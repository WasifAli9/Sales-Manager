import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Alert,
  Switch,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/contexts/AuthContext';
import { useNotifications } from '@/hooks/useNotifications';

function Avatar({ name, colors }: { name: string; colors: ReturnType<typeof useColors> }) {
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
      <Text style={[styles.avatarText, { color: colors.primaryForeground }]}>{initials || '?'}</Text>
    </View>
  );
}

function SettingsRow({
  icon,
  label,
  value,
  onPress,
  colors,
  destructive,
  rightElement,
}: {
  icon: string;
  label: string;
  value?: string;
  onPress?: () => void;
  colors: ReturnType<typeof useColors>;
  destructive?: boolean;
  rightElement?: React.ReactNode;
}) {
  return (
    <TouchableOpacity
      style={[styles.row, { borderBottomColor: colors.border }]}
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
      disabled={!onPress && !rightElement}
    >
      <View style={[styles.rowIcon, { backgroundColor: destructive ? colors.destructive + '22' : colors.muted }]}>
        <Feather
          name={icon as any}
          size={16}
          color={destructive ? colors.destructive : colors.mutedForeground}
        />
      </View>
      <Text style={[styles.rowLabel, { color: destructive ? colors.destructive : colors.foreground }]}>
        {label}
      </Text>
      <View style={styles.rowRight}>
        {value ? (
          <Text style={[styles.rowValue, { color: colors.mutedForeground }]} numberOfLines={1}>
            {value}
          </Text>
        ) : null}
        {rightElement ?? null}
        {onPress && !rightElement ? (
          <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, logout, biometricsAvailable, hasBiometricSession, disableBiometric } = useAuth();
  const { permissionStatus, schedulingEnabled, requestPermissions, toggleScheduling } =
    useNotifications();

  const [loggingOut, setLoggingOut] = useState(false);

  const displayName = user?.name ?? user?.email ?? 'You';
  const topInset = Platform.OS === 'web' ? 67 : insets.top;

  const handleLogout = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          setLoggingOut(true);
          await logout();
        },
      },
    ]);
  };

  const handleBiometricToggle = async () => {
    Haptics.selectionAsync();
    // Toggle is only shown when hasBiometricSession is true; turning it off disables biometric login.
    Alert.alert(
      'Turn off biometric sign-in?',
      "You'll need to use your password to sign in next time.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Turn off',
          style: 'destructive',
          onPress: () => disableBiometric(),
        },
      ],
    );
  };

  const handleNotificationToggle = async () => {
    Haptics.selectionAsync();
    if (permissionStatus !== 'granted') {
      await requestPermissions();
    } else {
      toggleScheduling();
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
      style={[styles.root, { backgroundColor: colors.background }]}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: topInset + 16,
          paddingBottom: insets.bottom + 40,
        },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={[styles.screenTitle, { color: colors.foreground }]}>Settings</Text>

      {/* Profile card */}
      <View style={[styles.profileCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Avatar name={displayName} colors={colors} />
        <View style={styles.profileInfo}>
          <Text style={[styles.profileName, { color: colors.foreground }]}>{displayName}</Text>
          {user?.email ? (
            <Text style={[styles.profileEmail, { color: colors.mutedForeground }]}>
              {user.email}
            </Text>
          ) : null}
        </View>
      </View>

      {/* Notifications section */}
      <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>Notifications</Text>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <SettingsRow
          icon="bell"
          label="Review Reminders"
          value={
            permissionStatus === 'granted'
              ? undefined
              : permissionStatus === 'denied'
              ? 'Blocked'
              : 'Not set up'
          }
          colors={colors}
          rightElement={
            permissionStatus !== 'denied' ? (
              <Switch
                value={permissionStatus === 'granted' && schedulingEnabled}
                onValueChange={handleNotificationToggle}
                trackColor={{ false: colors.muted, true: colors.primary + 'AA' }}
                thumbColor={
                  permissionStatus === 'granted' && schedulingEnabled
                    ? colors.primary
                    : colors.mutedForeground
                }
              />
            ) : undefined
          }
          onPress={permissionStatus === 'denied' ? undefined : handleNotificationToggle}
        />
        {permissionStatus === 'denied' && (
          <View style={[styles.warningRow, { backgroundColor: colors.destructive + '11' }]}>
            <Feather name="alert-triangle" size={13} color={colors.destructive} />
            <Text style={[styles.warningText, { color: colors.destructive }]}>
              Notifications are blocked. Enable them in iOS Settings → Closer.
            </Text>
          </View>
        )}
        {permissionStatus === 'granted' && (
          <View style={[styles.infoRow, { backgroundColor: colors.secondary }]}>
            <Feather name="info" size={13} color={colors.mutedForeground} />
            <Text style={[styles.infoText, { color: colors.mutedForeground }]}>
              Local alerts scheduled for pipeline review dates — even when the app is closed.
            </Text>
          </View>
        )}
      </View>

      {/* Account section */}
      <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>Account</Text>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <SettingsRow
          icon="mail"
          label="Email"
          value={user?.email ?? '—'}
          colors={colors}
        />
        {biometricsAvailable && hasBiometricSession && (
          <SettingsRow
            icon="lock"
            label="Biometric sign-in"
            colors={colors}
            rightElement={
              <Switch
                value={hasBiometricSession}
                onValueChange={handleBiometricToggle}
                trackColor={{ false: colors.muted, true: colors.primary + 'AA' }}
                thumbColor={hasBiometricSession ? colors.primary : colors.mutedForeground}
              />
            }
            onPress={handleBiometricToggle}
          />
        )}
      </View>

      {/* Danger zone */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <SettingsRow
          icon="log-out"
          label={loggingOut ? 'Signing out…' : 'Sign out'}
          onPress={loggingOut ? undefined : handleLogout}
          colors={colors}
          destructive
        />
      </View>

      {/* App info */}
      <View style={styles.appInfo}>
        <View style={[styles.appLogoRing, { backgroundColor: colors.primary }]}>
          <Text style={[styles.appLogoLetter, { color: colors.primaryForeground }]}>C</Text>
        </View>
        <Text style={[styles.appName, { color: colors.mutedForeground }]}>Closer Mobile</Text>
        <Text style={[styles.appVersion, { color: colors.muted }]}>v1.0.0</Text>
      </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 16, gap: 8 },
  screenTitle: {
    fontSize: 26,
    fontWeight: '700' as const,
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.5,
    marginBottom: 16,
  },
  profileCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 8,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 20,
    fontWeight: '700' as const,
    fontFamily: 'Inter_700Bold',
  },
  profileInfo: { flex: 1, gap: 3 },
  profileName: {
    fontSize: 17,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
  },
  profileEmail: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginTop: 8,
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: { flex: 1, fontSize: 15, fontFamily: 'Inter_400Regular' },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowValue: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  warningRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    margin: 12,
    padding: 12,
    borderRadius: 10,
  },
  warningText: { flex: 1, fontSize: 12, fontFamily: 'Inter_400Regular', lineHeight: 16 },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    margin: 12,
    padding: 12,
    borderRadius: 10,
  },
  infoText: { flex: 1, fontSize: 12, fontFamily: 'Inter_400Regular', lineHeight: 16 },
  appInfo: { alignItems: 'center', gap: 6, paddingVertical: 24 },
  appLogoRing: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appLogoLetter: {
    fontSize: 20,
    fontWeight: '700' as const,
    fontFamily: 'Inter_700Bold',
  },
  appName: { fontSize: 13, fontFamily: 'Inter_500Medium', fontWeight: '500' as const },
  appVersion: { fontSize: 11, fontFamily: 'Inter_400Regular' },
});
