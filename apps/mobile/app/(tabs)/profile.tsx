import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LogOut, Pencil } from 'lucide-react-native';
import { supabase } from '@/src/lib/supabase';
import { useAuth } from '@/src/hooks/useAuth';
import { useTheme, spacing, radius, typography } from '@/src/theme';
import { Screen } from '@/src/components/ui/Screen';
import { Avatar } from '@/src/components/Avatar';
import { ActivityCard } from '@/src/components/ActivityCard';
import { FeedItem, User } from '@/src/types';

async function fetchMyActivities(uid: string): Promise<FeedItem[]> {
  const { data, error } = await supabase
    .from('activities')
    .select('*, creator:users!creator_id(id, display_name, username, avatar_url)')
    .eq('creator_id', uid)
    .gte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(50);

  if (error) throw new Error(error.message);

  return (data ?? []).map(a => ({
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

async function fetchFollowCounts(uid: string) {
  const { data } = await supabase
    .from('follow_requests')
    .select('requester_id, target_id')
    .eq('status', 'accepted')
    .or(`requester_id.eq.${uid},target_id.eq.${uid}`);

  const connections = (data ?? []).length;
  return { followers: connections, following: connections };
}

export default function ProfileScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { profile } = useAuth();
  const qc = useQueryClient();

  const { data: activities = [], isLoading: loadingActivities } = useQuery({
    queryKey: ['my-activities'],
    queryFn: () => fetchMyActivities(profile!.id),
    enabled: !!profile,
  });

  const { data: counts } = useQuery({
    queryKey: ['follow-counts', profile?.id],
    queryFn: () => fetchFollowCounts(profile!.id),
    enabled: !!profile,
  });

  async function signOut() {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await supabase.auth.signOut();
          qc.clear();
        },
      },
    ]);
  }

  if (!profile) {
    return (
      <Screen>
        <View style={styles.centered}>
          <ActivityIndicator color={theme.primary} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Header row */}
        <View style={styles.topRow}>
          <Text style={[typography.title3, { color: theme.textPrimary }]}>Profile</Text>
          <View style={styles.headerActions}>
            <Pressable onPress={() => {}} hitSlop={8} style={styles.iconBtn}>
              <Pencil size={20} color={theme.textSecondary} strokeWidth={1.75} />
            </Pressable>
            <Pressable onPress={signOut} hitSlop={8} style={styles.iconBtn}>
              <LogOut size={20} color={theme.textSecondary} strokeWidth={1.75} />
            </Pressable>
          </View>
        </View>

        {/* Avatar + name */}
        <View style={styles.profileBlock}>
          <Avatar uri={profile.avatar_url} name={profile.display_name} size={80} />
          <Text style={[typography.title1, { color: theme.textPrimary, marginTop: spacing.md }]}>
            {profile.display_name}
          </Text>
          <Text style={[typography.callout, { color: theme.textTertiary, marginTop: 2 }]}>
            @{profile.username}
          </Text>
          {profile.bio && (
            <Text style={[typography.body, { color: theme.textSecondary, marginTop: spacing.sm, textAlign: 'center' }]}>
              {profile.bio}
            </Text>
          )}
        </View>

        {/* Counts */}
        {counts && (
          <View style={[styles.countsRow, { backgroundColor: theme.bgCard, borderRadius: radius.lg }]}>
            <View style={styles.count}>
              <Text style={[typography.title2, { color: theme.textPrimary }]}>{counts.following}</Text>
              <Text style={[typography.subhead, { color: theme.textSecondary }]}>Connections</Text>
            </View>
            <View style={[styles.countDivider, { backgroundColor: theme.separator }]} />
            <View style={styles.count}>
              <Text style={[typography.title2, { color: theme.textPrimary }]}>{activities.length}</Text>
              <Text style={[typography.subhead, { color: theme.textSecondary }]}>Upcoming</Text>
            </View>
          </View>
        )}

        {/* Upcoming activities */}
        <Text style={[typography.title3, { color: theme.textPrimary, marginBottom: spacing.md }]}>
          My upcoming activities
        </Text>

        {loadingActivities ? (
          <ActivityIndicator color={theme.primary} />
        ) : activities.length === 0 ? (
          <View style={[styles.emptyBox, { backgroundColor: theme.bgCard, borderRadius: radius.lg }]}>
            <Text style={[typography.body, { color: theme.textSecondary, textAlign: 'center' }]}>
              No upcoming activities. Tap + to create one!
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
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: {
    padding: spacing.lg,
    paddingTop: 60,
    paddingBottom: spacing['4xl'],
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing['2xl'],
  },
  headerActions: { flexDirection: 'row', gap: spacing.md },
  iconBtn: { padding: spacing.xs },
  profileBlock: {
    alignItems: 'center',
    marginBottom: spacing['2xl'],
  },
  countsRow: {
    flexDirection: 'row',
    marginBottom: spacing['2xl'],
  },
  count: {
    flex: 1,
    alignItems: 'center',
    padding: spacing.lg,
  },
  countDivider: {
    width: StyleSheet.hairlineWidth,
    marginVertical: spacing.md,
  },
  emptyBox: {
    padding: spacing['2xl'],
    alignItems: 'center',
  },
});
