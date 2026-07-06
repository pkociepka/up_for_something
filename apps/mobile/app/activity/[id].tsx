import { useState } from 'react';
import {
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Calendar,
  ChevronLeft,
  Lock,
  MapPin,
  MessageSquare,
  Users,
} from 'lucide-react-native';
import { supabase } from '@/src/lib/supabase';
import { useTheme, spacing, radius, typography } from '@/src/theme';
import { Screen } from '@/src/components/ui/Screen';
import { Button } from '@/src/components/ui/Button';
import { Avatar } from '@/src/components/Avatar';
import { CategoryIcon, CATEGORY_LABELS } from '@/src/components/CategoryIcon';
import { useAuth } from '@/src/hooks/useAuth';
import { ActivityDetail, ActivityParticipant, ActivityInvitation, InvitationStatus } from '@/src/types';
import { formatActivityDate } from '@/src/utils/date';

async function fetchActivity(id: string): Promise<ActivityDetail> {
  const { data: { user } } = await supabase.auth.getUser();
  const uid = user!.id;

  const { data: activity, error } = await supabase
    .from('activities')
    .select(`
      *,
      creator:users!creator_id(id, display_name, username, avatar_url)
    `)
    .eq('id', id)
    .single();

  if (error) throw new Error(error.message);

  let my_status: ActivityDetail['my_status'] = 'none';

  if (activity.visibility === 'followers') {
    const { data: p } = await supabase
      .from('participations')
      .select('id')
      .eq('activity_id', id)
      .eq('user_id', uid)
      .maybeSingle();
    my_status = p ? 'joined' : 'none';
  } else {
    const { data: inv } = await supabase
      .from('invitations')
      .select('status')
      .eq('activity_id', id)
      .eq('invitee_id', uid)
      .maybeSingle();
    my_status = (inv?.status as ActivityDetail['my_status']) ?? 'none';
  }

  if (activity.visibility === 'followers') {
    const { data: participants } = await supabase
      .from('participations')
      .select('user:users!user_id(id, display_name, username, avatar_url)')
      .eq('activity_id', id);

    return {
      ...activity,
      my_status,
      participants: participants?.map(p => p.user as unknown as ActivityParticipant) ?? [],
    };
  } else {
    const { data: invitations } = await supabase
      .from('invitations')
      .select('status, user:users!invitee_id(id, display_name, username, avatar_url)')
      .eq('activity_id', id);

    const isCreator = activity.creator_id === uid;
    const filtered = isCreator
      ? invitations ?? []
      : (invitations ?? []).filter(i => i.status !== 'declined');

    return {
      ...activity,
      my_status,
      invitations: filtered.map(i => ({
        user: i.user as unknown as ActivityInvitation['user'],
        status: i.status as InvitationStatus,
      })),
    };
  }
}

export default function ActivityDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const [actionLoading, setActionLoading] = useState(false);

  const { session } = useAuth();
  const currentUserId = session?.user.id;

  const { data: activity, isLoading, isError } = useQuery({
    queryKey: ['activity', id],
    queryFn: () => fetchActivity(id),
    enabled: !!id,
  });

  async function join() {
    setActionLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('participations').insert({ activity_id: id, user_id: user!.id });
    setActionLoading(false);
    if (error) {
      const msg = error.message.includes('activity_full') ? 'This activity is now full.' : error.message;
      Alert.alert('Could not join', msg);
    } else {
      qc.invalidateQueries({ queryKey: ['activity', id] });
      qc.invalidateQueries({ queryKey: ['feed'] });
    }
  }

  async function leave() {
    setActionLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from('participations')
      .delete()
      .eq('activity_id', id)
      .eq('user_id', user!.id);
    setActionLoading(false);
    if (error) Alert.alert('Could not leave', error.message);
    else {
      qc.invalidateQueries({ queryKey: ['activity', id] });
      qc.invalidateQueries({ queryKey: ['feed'] });
    }
  }

  async function respond(action: 'accept' | 'decline') {
    setActionLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    const status = action === 'accept' ? 'accepted' : 'declined';
    const { error } = await supabase
      .from('invitations')
      .update({ status, responded_at: new Date().toISOString() })
      .eq('activity_id', id)
      .eq('invitee_id', user!.id);
    setActionLoading(false);
    if (error) Alert.alert('Error', error.message);
    else {
      qc.invalidateQueries({ queryKey: ['activity', id] });
      qc.invalidateQueries({ queryKey: ['feed'] });
    }
  }

  async function cancelActivity() {
    Alert.alert(
      'Cancel this activity?',
      'Everyone who joined will be notified. This cannot be undone.',
      [
        { text: 'Dismiss', style: 'cancel' },
        {
          text: 'Cancel Activity',
          style: 'destructive',
          onPress: async () => {
            setActionLoading(true);
            const { error } = await supabase
              .from('activities')
              .update({ cancelled_at: new Date().toISOString() })
              .eq('id', id);
            setActionLoading(false);
            if (error) Alert.alert('Error', error.message);
            else {
              qc.invalidateQueries({ queryKey: ['activity', id] });
              qc.invalidateQueries({ queryKey: ['feed'] });
            }
          },
        },
      ],
    );
  }

  function openMaps() {
    if (!activity) return;
    const query = encodeURIComponent(activity.location_name);
    const url = Platform.select({
      ios:     `maps://?q=${query}`,
      android: `geo:0,0?q=${query}`,
    });
    if (url) Linking.openURL(url);
  }

  if (isLoading) {
    return (
      <Screen>
        <View style={styles.centered}>
          <Text style={[typography.body, { color: theme.textSecondary }]}>Loading…</Text>
        </View>
      </Screen>
    );
  }

  if (isError || !activity) {
    return (
      <Screen>
        <View style={styles.centered}>
          <Text style={[typography.body, { color: theme.textSecondary }]}>Activity not found.</Text>
        </View>
      </Screen>
    );
  }

  const isCreator = activity.creator_id === currentUserId;
  const isCancelled = !!activity.cancelled_at;
  const isFull = activity.max_participants !== null && activity.participant_count >= activity.max_participants;
  const spotsLeft = activity.max_participants ? activity.max_participants - activity.participant_count : null;

  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Back button */}
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <ChevronLeft size={28} color={theme.textPrimary} strokeWidth={1.75} />
        </Pressable>

        {/* Category chip */}
        <View style={[styles.categoryChip, { backgroundColor: theme.primarySubtle }]}>
          <CategoryIcon category={activity.category} size={16} color={theme.primary} />
          <Text style={[typography.caption, { color: theme.primary, marginLeft: spacing.xs }]}>
            {CATEGORY_LABELS[activity.category]}
          </Text>
          {activity.visibility === 'private' && (
            <>
              <View style={[styles.chipDot, { backgroundColor: theme.primary }]} />
              <Lock size={12} color={theme.primary} strokeWidth={1.75} />
              <Text style={[typography.caption, { color: theme.primary, marginLeft: 3 }]}>Private</Text>
            </>
          )}
        </View>

        {/* Cancelled banner */}
        {isCancelled && (
          <View style={[styles.cancelBanner, { backgroundColor: theme.dangerSubtle }]}>
            <Text style={[typography.callout, { color: theme.danger }]}>This activity was cancelled</Text>
          </View>
        )}

        {/* Title */}
        <Text style={[typography.display, { color: theme.textPrimary, marginTop: spacing.lg }]}>
          {activity.title}
        </Text>

        {/* Creator */}
        <Pressable
          onPress={() => router.push(`/profile/${activity.creator_id}`)}
          style={styles.creatorRow}
        >
          <Avatar uri={activity.creator.avatar_url} name={activity.creator.display_name} size={36} />
          <Text style={[typography.callout, { color: theme.info, marginLeft: spacing.sm }]}>
            {activity.creator.display_name}
          </Text>
        </Pressable>

        {/* Meta */}
        <View style={[styles.metaCard, { backgroundColor: theme.bgCard, borderRadius: radius.lg }]}>
          <Pressable onPress={() => {}} style={styles.metaRow}>
            <Calendar size={18} color={theme.primary} strokeWidth={1.75} />
            <Text style={[typography.body, { color: theme.textPrimary, marginLeft: spacing.md, flex: 1 }]}>
              {formatActivityDate(activity.scheduled_at)}
            </Text>
          </Pressable>

          <View style={[styles.divider, { backgroundColor: theme.separatorLight }]} />

          <Pressable onPress={openMaps} style={styles.metaRow}>
            <MapPin size={18} color={theme.primary} strokeWidth={1.75} />
            <Text style={[typography.body, { color: theme.info, marginLeft: spacing.md, flex: 1 }]}>
              {activity.location_name}
            </Text>
          </Pressable>

          <View style={[styles.divider, { backgroundColor: theme.separatorLight }]} />

          <View style={styles.metaRow}>
            <Users size={18} color={theme.primary} strokeWidth={1.75} />
            <View style={{ marginLeft: spacing.md, flex: 1 }}>
              <Text style={[typography.body, { color: theme.textPrimary }]}>
                {activity.participant_count} going
                {activity.max_participants
                  ? ` · ${spotsLeft} spot${spotsLeft !== 1 ? 's' : ''} left`
                  : ''}
              </Text>
              {isFull && (
                <Text style={[typography.footnote, { color: theme.danger, marginTop: 2 }]}>
                  This activity is full
                </Text>
              )}
            </View>
          </View>

          {activity.description && (
            <>
              <View style={[styles.divider, { backgroundColor: theme.separatorLight }]} />
              <View style={styles.metaRow}>
                <MessageSquare size={18} color={theme.primary} strokeWidth={1.75} />
                <Text style={[typography.body, { color: theme.textSecondary, marginLeft: spacing.md, flex: 1 }]}>
                  {activity.description}
                </Text>
              </View>
            </>
          )}
        </View>

        {/* Participants / Invitations */}
        {activity.visibility === 'followers' && activity.participants && activity.participants.length > 0 && (
          <View style={styles.section}>
            <Text style={[typography.title3, { color: theme.textPrimary, marginBottom: spacing.md }]}>
              Participants
            </Text>
            {activity.participants.map(p => (
              <Pressable
                key={p.id}
                onPress={() => router.push(`/profile/${p.id}`)}
                style={styles.personRow}
              >
                <Avatar uri={p.avatar_url} name={p.display_name} size={40} />
                <View style={{ marginLeft: spacing.md }}>
                  <Text style={[typography.callout, { color: theme.textPrimary }]}>{p.display_name}</Text>
                  <Text style={[typography.subhead, { color: theme.textTertiary }]}>@{p.username}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        )}

        {activity.visibility === 'private' && activity.invitations && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[typography.title3, { color: theme.textPrimary }]}>Invited</Text>
            </View>
            {activity.invitations.map(inv => (
              <Pressable
                key={inv.user.id}
                onPress={() => router.push(`/profile/${inv.user.id}`)}
                style={styles.personRow}
              >
                <Avatar uri={inv.user.avatar_url} name={inv.user.display_name} size={40} />
                <View style={{ marginLeft: spacing.md, flex: 1 }}>
                  <Text style={[typography.callout, { color: theme.textPrimary }]}>{inv.user.display_name}</Text>
                  <Text style={[typography.subhead, { color: theme.textTertiary }]}>@{inv.user.username}</Text>
                </View>
                <View style={[
                  styles.statusChip,
                  {
                    backgroundColor: inv.status === 'accepted'
                      ? theme.successSubtle
                      : inv.status === 'declined'
                      ? theme.dangerSubtle
                      : theme.bgInput,
                  },
                ]}>
                  <Text style={[
                    typography.caption,
                    {
                      color: inv.status === 'accepted'
                        ? theme.success
                        : inv.status === 'declined'
                        ? theme.danger
                        : theme.textSecondary,
                    },
                  ]}>
                    {inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        )}

        {/* Action buttons */}
        <View style={styles.actions}>
          {isCreator ? (
            !isCancelled && (
              <Button
                label="Cancel Activity"
                variant="danger"
                onPress={cancelActivity}
                loading={actionLoading}
              />
            )
          ) : !isCancelled ? (
            activity.visibility === 'followers' ? (
              activity.my_status === 'joined' ? (
                <Button label="Leave" variant="secondary" onPress={leave} loading={actionLoading} />
              ) : isFull ? (
                <Button label="No spots left" variant="secondary" disabled />
              ) : (
                <Button label="Join" onPress={join} loading={actionLoading} />
              )
            ) : (
              activity.my_status === 'pending' ? (
                <View style={styles.twoButtons}>
                  <Button label="Decline" variant="danger" onPress={() => respond('decline')} loading={actionLoading} style={{ flex: 1 }} />
                  <Button label="Accept" onPress={() => respond('accept')} loading={actionLoading} style={{ flex: 1 }} />
                </View>
              ) : activity.my_status === 'accepted' ? (
                <Button label="Decline" variant="danger" onPress={() => respond('decline')} loading={actionLoading} />
              ) : activity.my_status === 'declined' ? (
                <Button label="Re-accept" onPress={() => respond('accept')} loading={actionLoading} />
              ) : null
            )
          ) : null}
        </View>
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
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
  },
  chipDot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    marginHorizontal: spacing.xs,
  },
  cancelBanner: {
    padding: spacing.md,
    borderRadius: radius.md,
    marginTop: spacing.md,
  },
  creatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  metaCard: {
    overflow: 'hidden',
    marginBottom: spacing.lg,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: spacing.lg,
  },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: spacing.lg + 18 + spacing.md },
  section: {
    marginBottom: spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  statusChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  actions: {
    marginTop: spacing.md,
  },
  twoButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
});
