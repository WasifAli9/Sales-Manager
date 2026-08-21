import React from 'react';
import { Platform, TouchableOpacity, View } from 'react-native';
import { Tabs } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MenuDrawer } from '@/components/MenuDrawer';
import { MenuProvider, useMenu } from '@/contexts/MenuContext';
import { useColors } from '@/hooks/useColors';

/**
 * Hamburger trigger — rendered at layout level so it always floats above all
 * tab-screen content with no z-index fighting.
 */
function HamburgerButton() {
  const { openMenu } = useMenu();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const top = Platform.OS === 'web' ? 67 : insets.top;

  return (
    <TouchableOpacity
      onPress={openMenu}
      style={{
        position: 'absolute',
        top: top + 8,
        right: 16,
        padding: 10,
        backgroundColor: 'rgba(0,0,0,0.30)',
        borderRadius: 10,
      }}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <Feather name="menu" size={22} color={colors.foreground} />
    </TouchableOpacity>
  );
}

export default function TabLayout() {
  return (
    <MenuProvider>
      <View style={{ flex: 1 }}>
        {/*
         * tabBar={() => null} — completely removes the tab bar and its reserved
         * height. tabBarStyle:{display:'none'} hides it visually but still reserves
         * space, causing the scroll-to-bottom clipping bug.
         */}
        <Tabs
          screenOptions={{ headerShown: false }}
          tabBar={() => null}
        >
          <Tabs.Screen name="index"    options={{ title: 'Today' }} />
          <Tabs.Screen name="products" options={{ title: 'Products' }} />
          <Tabs.Screen name="pipeline" options={{ title: 'Pipeline' }} />
          <Tabs.Screen name="leads"    options={{ title: 'Leads' }} />
          <Tabs.Screen name="settings" options={{ title: 'Profile' }} />
        </Tabs>

        {/* Slide-in drawer — uses a Modal, so always above Tabs */}
        <MenuDrawer />

        {/* Hamburger trigger — above drawer (drawer is only visible when open) */}
        <HamburgerButton />
      </View>
    </MenuProvider>
  );
}
