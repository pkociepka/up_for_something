import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react-native';
import { supabase } from '@/src/lib/supabase';
import { useTheme, spacing, typography } from '@/src/theme';
import { ActivityCard } from '@/src/components/ActivityCard';
import { FeedItem } from '@/src/types';

const PAGE_SIZE = 20;

async function fetchFeed({ pageParam }: { pageParam: { after_at: string; after_id: string } | null }) {
  const { data, error } = await supabase.rpc('get_feed', {
    p_after_at: pageParam?.after_at ?? null,
    p_after_id: pageParam?.after_id ?? null,
    p_limit:    PAGE_SIZE,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as FeedItem[];
}

export default function FeedScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
    refetch,
  } = useInfiniteQuery({
    queryKey: ['feed'],
    queryFn: fetchFeed,
    initialPageParam: null,
    getNextPageParam: (lastPage) => {
      if (lastPage.length < PAGE_SIZE) return undefined;
      const last = lastPage[lastPage.length - 1];
      return { after_at: last.scheduled_at, after_id: last.id };
    },
  });

  const items = data?.pages.flat() ?? [];

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  if (isLoading) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.bgScreen }]}>
        <ActivityIndicator color={theme.primary} size="large" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.bgScreen }}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.separator }]}>
        <Text style={[typography.title1, { color: theme.textPrimary }]}>Feed</Text>
      </View>

      <FlatList
        data={items}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <ActivityCard item={item} onPress={() => router.push(`/activity/${item.id}`)} />
        )}
        contentContainerStyle={[
          styles.list,
          items.length === 0 && styles.emptyList,
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.primary}
          />
        }
        onEndReached={() => { if (hasNextPage) fetchNextPage(); }}
        onEndReachedThreshold={0.4}
        ListEmptyComponent={
          isError ? (
            <View style={styles.empty}>
              <Text style={[typography.title3, { color: theme.textPrimary }]}>Something went wrong</Text>
              <Text style={[typography.body, { color: theme.textSecondary, marginTop: spacing.sm }]}>
                Pull down to try again.
              </Text>
            </View>
          ) : (
            <View style={styles.empty}>
              <Search size={48} color={theme.textTertiary} strokeWidth={1.5} />
              <Text style={[typography.title3, { color: theme.textPrimary, marginTop: spacing.lg }]}>
                Nothing here yet
              </Text>
              <Text style={[typography.body, { color: theme.textSecondary, marginTop: spacing.sm, textAlign: 'center' }]}>
                Find people to follow and their upcoming activities will show up here.
              </Text>
            </View>
          )
        }
        ListFooterComponent={
          isFetchingNextPage ? (
            <ActivityIndicator color={theme.primary} style={{ padding: spacing.lg }} />
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: 60,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  list: {
    paddingTop: spacing.md,
    paddingBottom: spacing['4xl'],
  },
  emptyList: {
    flexGrow: 1,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing['3xl'],
  },
});
