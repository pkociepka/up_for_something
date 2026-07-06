import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, UserCheck, UserMinus, UserPlus, Clock } from 'lucide-react-native';
import { supabase } from '@/src/lib/supabase';
import { useAuth } from '@/src/hooks/useAuth';
import { useTheme, spacing, radius, typography } from '@/src/theme';
import { Screen } from '@/src/components/ui/Screen';
import { Avatar } from '@/src/components/Avatar';
import { ActivityCard } from '@/src/components/ActivityCard';
import { User, FeedItem } from '@/src/types';

type RelStatus = 'none' | 'pending_sent' | 'pending_received' | 'accepted';

interface ProfileData {
  user: Pick<User, 'id' | 'display_name' | 'username' | 'avatar_url' | 'bio'>;
  rel_status: RelStatus;
  rel_id: string | null;
  activities: FeedItem[];
}

async function fetchProfile(id: string, currentUserId: string): Promise<ProfileData> {
  const { data: user, error } = await supabase
    .from('users')
    .select('id, display_name, username, avatar_url, bio')
    .eq('id', id)
    .single();
  if (error) throw new Error(error.message);

  const { data: rel } = await supabase
    .from('follow_requests')
    .select('id, requester_id, target_id, status')
    .or(`and(requester_id.eq.${currentUserId},target_id.eq.${id}),and(requester_id.eq.${id},target_id.eq.${currentUserId})`)
    .in('status', ['pending', 'accepted'])
    .maybeSingle();

  let rel_status: RelStatus = 'none';
  if (rel?.status === 'accepted') rel_status = 'accepted';
  else if (rel?.status === 'pending' && rel.requester_id === currentUserId) rel_status = 'pending_sent';
  else if (rel?.status === 'pending' && rel.target_id === currentUserId) rel_status = 'pending_received';

  let activities: FeedItem[] = [];
  if (rel_status === 'accepted') {
    const { data: acts } = await supabase
      .from('activities')
      .select('*, creator:users!creator_id(id, display_name, username, avatar_url)')
      .eq('creator_id', id)
      .eq('visibility', 'followers')
      .gte('scheduled_at', new Date().toISOString())
      .is('cancelled_at', null)
      .order('scheduled_at', { ascending: true })
      .limit(20);

    activities = (acts ?? []).map(a => ({
      id: a.id,
      creator_id: a.creator_id,
      creator_display_name: a.creator.display_name,
      creator_avatar_url: a.creator.avatar_url,
      title: a.title,
      category: a.category,
      scheduled_at: a.scheduled_at,
      location_name: a.location_name,
      visibility: a.visibility,
      participant_count: a.participant_count,
      max_participants: a.max_participants,
      cancelled_at: a.cancelled_at,
      my_status: 'none',
    }));
  }

  return { user, rel_status, rel_id: rel?.id ?? null, activities };
}

export default function OtherProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const router = useRouter();
  const { session } = useAuth();
  const qc = useQueryClient();
  const currentUserId = session?.user.id ?? '';

  const { data, isLoading } = useQuery({
    queryKey: ['profile', id],
    queryFn: () => fetchProfile(id, currentUserId),
    enabled: !!id && !!currentUserId,
  });

  const sendRequest = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('follow_requests').insert({
        requester_id: currentUserId,
        target_id: id,
        status: 'pending',
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profile', id] }),
  });

  const cancelRequest = useMutation({
    mutationFn: async () => {
      if (!data?.rel_id) return;
      const { error } = await supabase
        .from('follow_requests')
        .update({ status: 'cancelled' })
        .eq('id', data.rel_id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profile', id] }),
  });

  const unfollow = useMutation({
    mutationFn: async () => {
      if (!data?.rel_id) return;
      const { error } = await supabase
        .from('follow_requests')
        .delete()
        .eq('id', data.rel_id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profile', id] });
      qc.invalidateQueries({ queryKey: ['feed'] });
    },
  });

  const acceptRequest = useMutation({
    mutationFn: async () => {
      if (!data?.rel_id) return;
      const { error } = await supabase
        .from('follow_requests')
        .update({ status: 'accepted', responded_at: new Date().toISOString() })
        .eq('id', data.rel_id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profile', id] });
      qc.invalidateQueries({ queryKey: ['follow-requests-incoming'] });
    },
  });

  if (isLoading || !data) {
    return (
      <Screen>
        <View style={styles.centered}>
          <ActivityIndicator color={theme.primary} />
        </View>
      </Screen>
    );
  }

  const { user, rel_status, activities } = data;

  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <ChevronLeft size={28} color={theme.textPrimary} strokeWidth={1.75} />
        </Pressable>

        <View style={styles.profileBlock}>
          <Avatar uri={user.avatar_url} name={user.display_name} size={80} />
          <Text style={[typography.title1, { color: theme.textPrimary, marginTop: spacing.md }]}>
            {user.display_name}
          </Text>
          <Text style={[typography.callout, { color: theme.textTertiary, marginTop: 2 }]}>
            @{user.username}
          </Text>
          {user.bio && (
            <Text style={[typography.body, { color: theme.textSecondary, marginTop: spacing.sm, textAlign: 'center' }]}>
              {user.bio}
            </Text>
          )}

          {/* Follow button */}
          <View style={{ marginTop: spacing.lg }}>
            {rel_status === 'none' && (
              <Pressable
                onPress={() => sendRequest.mutate()}
                style={[styles.followBtn, { backgroundColor: theme.primary }]}
              >
                <UserPlus size={18} color="#fff" strokeWidth={1.75} />
                <Text style={[typography.callout, { color: '#fff', marginLeft: spacing.sm }]}>Follow</Text>
              </Pressable>
            )}
            {rel_status === 'pending_sent' && (
              <Pressable
                onPress={() => cancelRequest.mutate()}
                style={[styles.followBtn, { backgroundColor: theme.bgInput }]}
              >
                <Clock size={18} color={theme.textSecondary} strokeWidth={1.75} />
                <Text style={[typography.callout, { color: theme.textSecondary, marginLeft: spacing.sm }]}>Pending</Text>
              </Pressable>
            )}
            {rel_status === 'pending_received' && (
              <View style={styles.twoButtons}>
                <Pressable
                  onPress={() => cancelRequest.mutate()}
                  style={[styles.followBtn, { backgroundColor: theme.bgInput }]}
                >
                  <Text style={[typography.callout, { color: theme.textSecondary }]}>Decline</Text>
                </Pressable>
                <Pressable
                  onPress={() => acceptRequest.mutate()}
                  style={[styles.followBtn, { backgroundColor: theme.primary }]}
                >
                  <UserCheck size={18} color="#fff" strokeWidth={1.75} />
                  <Text style={[typography.callout, { color: '#fff', marginLeft: spacing.sm }]}>Accept</Text>
                </Pressable>
              </View>
            )}
            {rel_status === 'accepted' && (
              <Pressable
                onPress={() => unfollow.mutate()}
                style={[styles.followBtn, { backgroundColor: theme.bgInput }]}
              >
                <UserMinus size={18} color={theme.textSecondary} strokeWidth={1.75} />
                <Text style={[typography.callout, { color: theme.textSecondary, marginLeft: spacing.sm }]}>
                  Unfollow
                </Text>
              </Pressable>
            )}
          </View>
        </View>

        {/* Activities */}
        {rel_status === 'accepted' && (
          <>
            <Text style={[typography.title3, { color: theme.textPrimary, marginBottom: spacing.md }]}>
              Upcoming
            </Text>
            {activities.length === 0 ? (
              <View style={[styles.emptyBox, { backgroundColor: theme.bgCard, borderRadius: radius.lg }]}>
                <Text style={[typography.body, { color: theme.textSecondary, textAlign: 'center' }]}>
                  No upcoming activities
                </Text>
              </View>
            ) : (
              activities.map(item => (
                <ActivityCard
                  key={item.id}
                  item={item}
                  onPress={() => router.push(`/activity/${item.id}`)}
                />
              ))
            )}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: {
    padding: spacing.lg,
    paddingBottom: spacing['4xl'],
  },
  backBtn: {
    marginBottom: spacing.md,
    alignSelf: 'flex-start',
    marginLeft: -spacing.xs,
  },
  profileBlock: {
    alignItems: 'center',
    marginBottom: spacing['2xl'],
  },
  followBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    height: 48,
    borderRadius: radius.xl,
  },
  twoButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  emptyBox: {
    padding: spacing['2xl'],
    alignItems: 'center',
    marginHorizontal: spacing.lg,
  },
});
