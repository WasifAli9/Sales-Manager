import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter, useSegments } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useMenu } from '@/contexts/MenuContext';

const DRAWER_WIDTH = 270;

const NAV_ITEMS: { label: string; icon: string; route: string; segment: string }[] = [
  { label: 'Today',    icon: 'calendar', route: '/(tabs)/',        segment: 'index' },
  { label: 'Products', icon: 'package',  route: '/(tabs)/products', segment: 'products' },
  { label: 'Pipeline', icon: 'trending-up', route: '/(tabs)/pipeline', segment: 'pipeline' },
  { label: 'Leads',    icon: 'users',    route: '/(tabs)/leads',   segment: 'leads' },
  { label: 'Profile',  icon: 'user',     route: '/(tabs)/settings', segment: 'settings' },
];

export function MenuDrawer() {
  const { isOpen, closeMenu } = useMenu();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const segments = useSegments();

  const translateX = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isOpen) {
      Animated.parallel([
        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
          tension: 120,
          friction: 14,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateX, {
          toValue: -DRAWER_WIDTH,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [isOpen]);

  const navigate = (route: string) => {
    closeMenu();
    router.push(route as never);
  };

  const activeSegment = segments[segments.length - 1] ?? 'index';

  return (
    <Modal
      visible={isOpen}
      transparent
      animationType="none"
      onRequestClose={closeMenu}
      statusBarTranslucent
    >
      {/* Backdrop */}
      <TouchableWithoutFeedback onPress={closeMenu}>
        <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]} />
      </TouchableWithoutFeedback>

      {/* Drawer panel */}
      <Animated.View
        style={[
          styles.drawer,
          {
            backgroundColor: colors.card,
            borderRightColor: colors.border,
            paddingTop: insets.top + 24,
            paddingBottom: insets.bottom + 24,
            transform: [{ translateX }],
          },
        ]}
      >
        {/* App name */}
        <View style={styles.brandRow}>
          <Text style={[styles.brandName, { color: colors.primary }]}>Sales Manager</Text>
          <TouchableOpacity onPress={closeMenu} style={styles.closeBtn} hitSlop={12}>
            <Feather name="x" size={20} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        {/* Nav items */}
        <View style={styles.navList}>
          {NAV_ITEMS.map((item) => {
            const isActive = activeSegment === item.segment ||
              (item.segment === 'index' && activeSegment === '(tabs)');
            return (
              <TouchableOpacity
                key={item.label}
                style={[
                  styles.navItem,
                  { borderRadius: colors.radius / 2 },
                  isActive && { backgroundColor: colors.primary + '1A' },
                ]}
                onPress={() => navigate(item.route)}
                activeOpacity={0.7}
              >
                <Feather
                  name={item.icon as never}
                  size={20}
                  color={isActive ? colors.primary : colors.mutedForeground}
                />
                <Text
                  style={[
                    styles.navLabel,
                    { color: isActive ? colors.primary : colors.foreground },
                    isActive && styles.navLabelActive,
                  ]}
                >
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  drawer: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: DRAWER_WIDTH,
    borderRightWidth: 1,
    paddingHorizontal: 20,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  brandName: {
    fontSize: 24,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 0.3,
  },
  closeBtn: {
    padding: 4,
  },
  divider: {
    height: 1,
    marginBottom: 16,
  },
  navList: {
    gap: 4,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  navLabel: {
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
  },
  navLabelActive: {
    fontFamily: 'Inter_600SemiBold',
  },
});
