import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search as SearchIcon, UserCheck, UserPlus, Clock } from 'lucide-react-native';
import { supabase } from '@/src/lib/supabase';
import { useTheme, spacing, radius, typography } from '@/src/theme';
import { Screen } from '@/src/components/ui/Screen';
import { Avatar } from '@/src/components/Avatar';
import { User } from '@/src/types';

interface UserSearchResult extends Pick<User, 'id' | 'display_name' | 'username' | 'avatar_url'> {
  follow_status: 'none' | 'pending_sent' | 'accepted' | 'pending_received';
}

async function searchUsers(query: string): Promise<UserSearchResult[]> {
  if (query.length < 2) return [];
  const { data: { user } } = await supabase.auth.getUser();
  const uid = user!.id;

  const { data: users, error } = await supabase
    .from('users')
    .select('id, display_name, username, avatar_url')
    .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`)
    .neq('id', uid)
    .limit(30);

  if (error) throw new Error(error.message);

  const userIds = (users ?? []).map(u => u.id);
  const { data: follows } = await supabase
    .from('follow_requests')
    .select('id, requester_id, target_id, status')
    .or(
      userIds.map(id =>
        `and(requester_id.eq.${uid},target_id.eq.${id}),and(requester_id.eq.${id},target_id.eq.${uid})`
      ).join(',')
    );

  return (users ?? []).map(u => {
    const rel = (follows ?? []).find(
      f => (f.requester_id === uid && f.target_id === u.id) ||
           (f.requester_id === u.id && f.target_id === uid)
    );
    let follow_status: UserSearchResult['follow_status'] = 'none';
    if (rel?.status === 'accepted') follow_status = 'accepted';
    else if (rel?.status === 'pending' && rel.requester_id === uid) follow_status = 'pending_sent';
    else if (rel?.status === 'pending' && rel.target_id === uid) follow_status = 'pending_received';

    return { ...u, follow_status };
  });
}

export default function SearchScreen() {
  const theme = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const [query, setQuery] = useState('');

  const { data: results = [], isLoading } = useQuery({
    queryKey: ['search', query],
    queryFn: () => searchUsers(query),
    enabled: query.length >= 2,
    staleTime: 5_000,
  });

  const sendRequest = useMutation({
    mutationFn: async (targetId: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from('follow_requests').insert({
        requester_id: user!.id,
        target_id: targetId,
        status: 'pending',
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['search', query] }),
  });

  const cancelRequest = useMutation({
    mutationFn: async (targetId: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('follow_requests')
        .update({ status: 'cancelled' })
        .eq('requester_id', user!.id)
        .eq('target_id', targetId)
        .eq('status', 'pending');
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['search', query] }),
  });

  return (
    <Screen edges={['top']}>
      {/* Search bar */}
      <View style={[styles.searchBar, { backgroundColor: theme.bgCard, borderBottomColor: theme.separator }]}>
        <Text style={[typography.title3, { color: theme.textPrimary, marginBottom: spacing.md }]}>Find People</Text>
        <View style={[styles.inputWrap, { backgroundColor: theme.bgInput, borderRadius: radius.md }]}>
          <SearchIcon size={18} color={theme.textTertiary} strokeWidth={1.75} />
          <TextInput
            style={[styles.input, { color: theme.textPrimary }]}
            value={query}
            onChangeText={setQuery}
            placeholder="Search by name or username"
            placeholderTextColor={theme.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
      </View>

      {isLoading && query.length >= 2 ? (
        <View style={styles.centered}>
          <ActivityIndicator color={theme.primary} />
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            query.length >= 2 ? (
              <View style={styles.centered}>
                <Text style={[typography.body, { color: theme.textSecondary }]}>No users found for "{query}"</Text>
              </View>
            ) : (
              <View style={styles.centered}>
                <SearchIcon size={48} color={theme.textTertiary} strokeWidth={1.5} />
                <Text style={[typography.body, { color: theme.textSecondary, marginTop: spacing.md }]}>
                  Type to search for people
                </Text>
              </View>
            )
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/profile/${item.id}`)}
              style={({ pressed }) => [
                styles.userRow,
                {
                  backgroundColor: theme.bgCard,
                  borderRadius: radius.lg,
                  opacity: pressed ? 0.9 : 1,
                },
              ]}
            >
              <Avatar uri={item.avatar_url} name={item.display_name} size={48} />
              <View style={{ flex: 1, marginLeft: spacing.md }}>
                <Text style={[typography.callout, { color: theme.textPrimary }]}>{item.display_name}</Text>
                <Text style={[typography.subhead, { color: theme.textTertiary }]}>@{item.username}</Text>
              </View>
              <FollowButton
                status={item.follow_status}
                onFollow={() => sendRequest.mutate(item.id)}
                onCancel={() => cancelRequest.mutate(item.id)}
              />
            </Pressable>
          )}
        />
      )}
    </Screen>
  );
}

function FollowButton({
  status,
  onFollow,
  onCancel,
}: {
  status: UserSearchResult['follow_status'];
  onFollow: () => void;
  onCancel: () => void;
}) {
  const theme = useTheme();

  if (status === 'accepted') {
    return (
      <View style={[styles.followBtn, { backgroundColor: theme.successSubtle }]}>
        <UserCheck size={16} color={theme.success} strokeWidth={1.75} />
        <Text style={[typography.caption, { color: theme.success, marginLeft: 4 }]}>Mutual</Text>
      </View>
    );
  }

  if (status === 'pending_sent') {
    return (
      <Pressable
        onPress={onCancel}
        style={[styles.followBtn, { backgroundColor: theme.bgInput }]}
      >
        <Clock size={16} color={theme.textSecondary} strokeWidth={1.75} />
        <Text style={[typography.caption, { color: theme.textSecondary, marginLeft: 4 }]}>Pending</Text>
      </Pressable>
    );
  }

  if (status === 'pending_received') {
    return (
      <View style={[styles.followBtn, { backgroundColor: theme.primarySubtle }]}>
        <Text style={[typography.caption, { color: theme.primary }]}>Wants to follow</Text>
      </View>
    );
  }

  return (
    <Pressable
      onPress={onFollow}
      style={[styles.followBtn, { backgroundColor: theme.primary }]}
    >
      <UserPlus size={16} color="#fff" strokeWidth={1.75} />
      <Text style={[typography.caption, { color: '#fff', marginLeft: 4 }]}>Follow</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  searchBar: {
    padding: spacing.lg,
    paddingTop: 60,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    height: 44,
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    fontSize: 15,
  },
  list: {
    padding: spacing.lg,
    paddingBottom: spacing['4xl'],
    gap: spacing.sm,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing['3xl'],
    minHeight: 200,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
  },
  followBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
});
