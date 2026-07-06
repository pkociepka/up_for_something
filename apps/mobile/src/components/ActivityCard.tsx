import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Calendar, Lock, MapPin, Users } from 'lucide-react-native';
import { useTheme, spacing, radius, typography } from '@/src/theme';
import { Avatar } from '@/src/components/Avatar';
import { CategoryIcon, CATEGORY_LABELS } from '@/src/components/CategoryIcon';
import { FeedItem } from '@/src/types';
import { formatActivityDate } from '@/src/utils/date';

interface ActivityCardProps {
  item: FeedItem;
  onPress: () => void;
}

export function ActivityCard({ item, onPress }: ActivityCardProps) {
  const theme = useTheme();
  const isCancelled = !!item.cancelled_at;
  const isFull = item.max_participants !== null && item.participant_count >= item.max_participants;
  const isJoined = item.my_status === 'joined' || item.my_status === 'accepted';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: theme.bgCard,
          borderRadius: radius.lg,
          opacity: pressed ? 0.95 : 1,
          marginHorizontal: spacing.lg,
          marginBottom: spacing.sm,
        },
        isCancelled && { opacity: 0.5 },
      ]}
    >
      {/* Header row */}
      <View style={styles.header}>
        <View style={styles.creatorRow}>
          <Avatar uri={item.creator_avatar_url} name={item.creator_display_name} size={32} />
          <Text style={[typography.callout, { color: theme.textPrimary, marginLeft: spacing.sm, flex: 1 }]} numberOfLines={1}>
            {item.creator_display_name}
          </Text>
        </View>

        <View style={[styles.categoryChip, { backgroundColor: theme.primarySubtle }]}>
          <CategoryIcon category={item.category} size={14} color={theme.primary} />
          <Text style={[typography.caption, { color: theme.primary, marginLeft: 4 }]}>
            {CATEGORY_LABELS[item.category]}
          </Text>
        </View>
      </View>

      {/* Title */}
      <Text style={[typography.title2, { color: theme.textPrimary, marginTop: spacing.sm }]} numberOfLines={2}>
        {item.title}
      </Text>

      {/* Meta row */}
      <View style={styles.meta}>
        <View style={styles.metaItem}>
          <Calendar size={13} color={theme.textTertiary} strokeWidth={1.75} />
          <Text style={[typography.subhead, { color: theme.textSecondary, marginLeft: spacing.xs }]}>
            {formatActivityDate(item.scheduled_at)}
          </Text>
        </View>

        <View style={styles.metaItem}>
          <MapPin size={13} color={theme.textTertiary} strokeWidth={1.75} />
          <Text style={[typography.subhead, { color: theme.textSecondary, marginLeft: spacing.xs }]} numberOfLines={1}>
            {item.location_name}
          </Text>
        </View>
      </View>

      {/* Footer row */}
      <View style={styles.footer}>
        <View style={styles.metaItem}>
          <Users size={13} color={theme.textTertiary} strokeWidth={1.75} />
          <Text style={[typography.footnote, { color: theme.textTertiary, marginLeft: spacing.xs }]}>
            {item.max_participants
              ? `${item.participant_count} of ${item.max_participants}${isFull ? ' · Full' : ''}`
              : `${item.participant_count} going`
            }
          </Text>
        </View>

        <View style={styles.badges}>
          {item.visibility === 'private' && (
            <View style={[styles.badge, { backgroundColor: theme.bgInput }]}>
              <Lock size={11} color={theme.textTertiary} strokeWidth={1.75} />
              <Text style={[typography.caption, { color: theme.textTertiary, marginLeft: 3 }]}>Private</Text>
            </View>
          )}

          {isCancelled && (
            <View style={[styles.badge, { backgroundColor: theme.dangerSubtle }]}>
              <Text style={[typography.caption, { color: theme.danger }]}>Cancelled</Text>
            </View>
          )}

          {isJoined && !isCancelled && (
            <View style={[styles.badge, { backgroundColor: theme.successSubtle }]}>
              <Text style={[typography.caption, { color: theme.success }]}>
                {item.my_status === 'accepted' ? 'Accepted' : 'Joined'}
              </Text>
            </View>
          )}

          {item.my_status === 'pending' && (
            <View style={[styles.badge, { backgroundColor: theme.bgInput }]}>
              <Text style={[typography.caption, { color: theme.textSecondary }]}>Invited</Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.xl,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 4,
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  creatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: spacing.sm,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
  },
  meta: {
    marginTop: spacing.md,
    gap: spacing.xs,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  badges: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
});
