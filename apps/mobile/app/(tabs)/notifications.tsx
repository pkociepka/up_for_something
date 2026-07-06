import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell } from 'lucide-react-native';
import { supabase } from '@/src/lib/supabase';
import { useTheme, spacing, radius, typography } from '@/src/theme';
import { Screen } from '@/src/components/ui/Screen';
import { Avatar } from '@/src/components/Avatar';
import { FollowRequest } from '@/src/types';

type PendingRequest = FollowRequest & {
  requester: { id: string; display_name: string; username: string; avatar_url: string | null };
};

async function fetchIncoming(): Promise<PendingRequest[]> {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('follow_requests')
    .select('*, requester:users!requester_id(id, display_name, username, avatar_url)')
    .eq('target_id', user!.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as PendingRequest[];
}

export default function NotificationsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const qc = useQueryClient();

  const { data: requests = [], isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['follow-requests-incoming'],
    queryFn: fetchIncoming,
  });

  const respond = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: 'accept' | 'decline' }) => {
      const { error } = await supabase
        .from('follow_requests')
        .update({
          status: action === 'accept' ? 'accepted' : 'declined',
          responded_at: new Date().toISOString(),
        })
        .eq('id', id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['follow-requests-incoming'] });
      qc.invalidateQueries({ queryKey: ['feed'] });
    },
  });

  return (
    <Screen edges={['top']}>
      <View style={[styles.header, { borderBottomColor: theme.separator }]}>
        <Text style={[typography.title1, { color: theme.textPrimary }]}>Notifications</Text>
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={theme.primary} />
        </View>
      ) : (
        <FlatList
          data={requests}
          keyExtractor={item => item.id}
          contentContainerStyle={[styles.list, requests.length === 0 && styles.emptyList]}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={theme.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.centered}>
              <Bell size={48} color={theme.textTertiary} strokeWidth={1.5} />
              <Text style={[typography.title3, { color: theme.textPrimary, marginTop: spacing.lg }]}>
                All caught up
              </Text>
              <Text style={[typography.body, { color: theme.textSecondary, marginTop: spacing.sm }]}>
                Pending follow requests will appear here.
              </Text>
            </View>
          }
          ListHeaderComponent={
            requests.length > 0 ? (
              <Text style={[typography.subhead, { color: theme.textSecondary, marginBottom: spacing.md }]}>
                Follow requests
              </Text>
            ) : null
          }
          renderItem={({ item }) => (
            <View style={[styles.requestCard, { backgroundColor: theme.bgCard, borderRadius: radius.lg }]}>
              <Pressable
                onPress={() => router.push(`/profile/${item.requester_id}`)}
                style={styles.personRow}
              >
                <Avatar uri={item.requester.avatar_url} name={item.requester.display_name} size={48} />
                <View style={{ flex: 1, marginLeft: spacing.md }}>
                  <Text style={[typography.callout, { color: theme.textPrimary }]}>
                    {item.requester.display_name}
                  </Text>
                  <Text style={[typography.subhead, { color: theme.textTertiary }]}>
                    @{item.requester.username} · wants to follow you
                  </Text>
                </View>
              </Pressable>

              <View style={styles.actions}>
                <Pressable
                  onPress={() => respond.mutate({ id: item.id, action: 'decline' })}
                  style={[styles.actionBtn, { backgroundColor: theme.bgInput, flex: 1 }]}
                >
                  <Text style={[typography.callout, { color: theme.textPrimary }]}>Decline</Text>
                </Pressable>
                <Pressable
                  onPress={() => respond.mutate({ id: item.id, action: 'accept' })}
                  style={[styles.actionBtn, { backgroundColor: theme.primary, flex: 1 }]}
                >
                  <Text style={[typography.callout, { color: '#fff' }]}>Accept</Text>
                </Pressable>
              </View>
            </View>
          )}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: 60,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing['3xl'] },
  list: { padding: spacing.lg, paddingBottom: spacing['4xl'] },
  emptyList: { flexGrow: 1 },
  requestCard: {
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionBtn: {
    height: 44,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
