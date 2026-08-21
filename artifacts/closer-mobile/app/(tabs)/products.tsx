import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useListProducts, Product } from '@workspace/api-client-react';
import { ProductSocialModal } from '@/components/ProductSocialModal';

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  active: { label: 'Active', color: '#4DD4C1', bg: '#4DD4C122' },
  launching: { label: 'Launching', color: '#7C8CFF', bg: '#7C8CFF22' },
  paused: { label: 'Paused', color: '#9AA6BF', bg: '#9AA6BF22' },
  idea: { label: 'Idea', color: '#F2B441', bg: '#F2B44122' },
};

function ProductCard({
  product,
  colors,
  onPressSocial,
}: {
  product: Product;
  colors: ReturnType<typeof useColors>;
  onPressSocial: () => void;
}) {
  const statusCfg = STATUS_CONFIG[product.status] ?? STATUS_CONFIG.paused;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
        },
      ]}
    >
      <View style={styles.cardTop}>
        <View style={styles.cardTitleRow}>
          <Text style={[styles.cardName, { color: colors.foreground }]} numberOfLines={1}>
            {product.name}
          </Text>
          <View style={[styles.statusBadge, { backgroundColor: statusCfg.bg }]}>
            <View
              style={[styles.statusDot, { backgroundColor: statusCfg.color }]}
            />
            <Text style={[styles.statusText, { color: statusCfg.color }]}>
              {statusCfg.label}
            </Text>
          </View>
        </View>
        {product.tagline ? (
          <Text style={[styles.tagline, { color: colors.mutedForeground }]} numberOfLines={2}>
            {product.tagline}
          </Text>
        ) : null}
      </View>

      {(product.targetMarket || product.websiteUrl) && (
        <View style={[styles.cardMeta, { borderTopColor: colors.border }]}>
          {product.targetMarket ? (
            <View style={styles.metaItem}>
              <Feather name="users" size={12} color={colors.mutedForeground} />
              <Text
                style={[styles.metaText, { color: colors.mutedForeground }]}
                numberOfLines={1}
              >
                {product.targetMarket}
              </Text>
            </View>
          ) : null}
          {product.websiteUrl ? (
            <View style={styles.metaItem}>
              <Feather name="globe" size={12} color={colors.mutedForeground} />
              <Text
                style={[styles.metaText, { color: colors.mutedForeground }]}
                numberOfLines={1}
              >
                {product.websiteUrl.replace(/^https?:\/\/(www\.)?/, '')}
              </Text>
            </View>
          ) : null}
        </View>
      )}

      {product.aiSummary ? (
        <View style={[styles.aiBlock, { backgroundColor: colors.secondary }]}>
          <View style={styles.aiHeader}>
            <Feather name="zap" size={12} color={colors.ai} />
            <Text style={[styles.aiLabel, { color: colors.ai }]}>AI Summary</Text>
          </View>
          <Text style={[styles.aiText, { color: colors.mutedForeground }]} numberOfLines={3}>
            {product.aiSummary}
          </Text>
        </View>
      ) : null}

      {/* Social Schedule shortcut */}
      <TouchableOpacity
        style={[styles.socialBtn, { borderTopColor: colors.border }]}
        onPress={onPressSocial}
        activeOpacity={0.7}
      >
        <Feather name="rss" size={13} color={colors.primary} />
        <Text style={[styles.socialBtnText, { color: colors.primary }]}>Social Schedule</Text>
        <Feather name="chevron-right" size={13} color={colors.primary} style={{ marginLeft: 'auto' }} />
      </TouchableOpacity>
    </View>
  );
}

export default function ProductsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [socialProduct, setSocialProduct] = useState<Product | null>(null);

  const productsQ = useListProducts();
  const products = productsQ.data ?? [];

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: productsQ.queryKey });
    setRefreshing(false);
  }, [queryClient, productsQ.queryKey]);

  const topInset = Platform.OS === 'web' ? 67 : insets.top;

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        style={[styles.root, { backgroundColor: colors.background }]}
        contentContainerStyle={[
          styles.content,
          { paddingTop: topInset + 16, paddingBottom: insets.bottom + 40 },
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
        <Text style={[styles.screenTitle, { color: colors.foreground }]}>Products</Text>
        <Text style={[styles.screenSub, { color: colors.mutedForeground }]}>
          {products.length} product{products.length !== 1 ? 's' : ''}
        </Text>

        {productsQ.isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 48 }} />
        ) : products.length === 0 ? (
          <View style={[styles.emptyState, { borderColor: colors.border }]}>
            <Feather name="package" size={36} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No products yet</Text>
            <Text style={[styles.emptySubText, { color: colors.mutedForeground }]}>
              Add products from the Closer web app.
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {products.map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                colors={colors}
                onPressSocial={() => setSocialProduct(p)}
              />
            ))}
          </View>
        )}
      </ScrollView>

      {/* Social schedule modal */}
      {socialProduct && (
        <ProductSocialModal
          productId={socialProduct.id}
          productName={socialProduct.name}
          visible={!!socialProduct}
          onClose={() => setSocialProduct(null)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 16 },
  screenTitle: {
    fontSize: 26,
    fontWeight: '700' as const,
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  screenSub: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    marginBottom: 20,
  },
  list: { gap: 12 },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  cardTop: { padding: 16 },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 6,
  },
  cardName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: {
    fontSize: 11,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
  },
  tagline: { fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 18 },
  cardMeta: {
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 6,
  },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: {
    flex: 1,
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
  },
  aiBlock: {
    margin: 12,
    borderRadius: 10,
    padding: 12,
    gap: 6,
  },
  aiHeader: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  aiLabel: {
    fontSize: 11,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
  },
  aiText: { fontSize: 12, fontFamily: 'Inter_400Regular', lineHeight: 17 },
  socialBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  socialBtnText: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    fontWeight: '600',
  },
  emptyState: {
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: 'dashed',
    padding: 40,
    alignItems: 'center',
    gap: 10,
    marginTop: 24,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
  },
  emptySubText: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
  },
});
