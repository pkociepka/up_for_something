import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import DateTimePicker from '@react-native-community/datetimepicker';
import { ChevronLeft } from 'lucide-react-native';
import { supabase } from '@/src/lib/supabase';
import { useTheme, spacing, radius, typography } from '@/src/theme';
import { Button } from '@/src/components/ui/Button';
import { CategoryIcon, CATEGORY_LABELS } from '@/src/components/CategoryIcon';
import { ActivityCategory, ActivityVisibility } from '@/src/types';

const CATEGORIES: ActivityCategory[] = [
  'sports', 'board_games', 'video_games', 'movies',
  'music', 'food_drinks', 'outdoors', 'travel', 'other',
];

export default function CreateScreen() {
  const theme = useTheme();
  const router = useRouter();
  const qc = useQueryClient();

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<ActivityCategory>('other');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(() => {
    const d = new Date();
    d.setHours(d.getHours() + 2, 0, 0, 0);
    return d;
  });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [locationName, setLocationName] = useState('');
  const [maxParticipants, setMaxParticipants] = useState('');
  const [visibility, setVisibility] = useState<ActivityVisibility>('followers');
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!title.trim()) { Alert.alert('Missing title', 'Please give your activity a title.'); return; }
    if (!locationName.trim()) { Alert.alert('Missing location', 'Please add a location.'); return; }
    if (date < new Date()) { Alert.alert('Past date', 'Please pick a future date and time.'); return; }

    const maxP = maxParticipants ? parseInt(maxParticipants, 10) : undefined;
    if (maxParticipants && (isNaN(maxP!) || maxP! < 2)) {
      Alert.alert('Invalid limit', 'Participant limit must be at least 2.');
      return;
    }

    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('activities')
      .insert({
        creator_id: user!.id,
        title: title.trim(),
        category,
        description: description.trim() || null,
        scheduled_at: date.toISOString(),
        location_name: locationName.trim(),
        max_participants: maxP ?? null,
        visibility,
      })
      .select()
      .single();
    setLoading(false);

    if (error) {
      Alert.alert('Could not create activity', error.message);
    } else {
      qc.invalidateQueries({ queryKey: ['feed'] });
      router.replace(`/activity/${data.id}`);
    }
  }

  const formattedDate = date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  const formattedTime = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.bgScreen }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <ChevronLeft size={28} color={theme.textPrimary} strokeWidth={1.75} />
          </Pressable>
          <Text style={[typography.title3, { color: theme.textPrimary }]}>New Activity</Text>
          <View style={{ width: 28 }} />
        </View>

        {/* Title */}
        <Section label="Title">
          <TextInput
            style={[styles.input, { backgroundColor: theme.bgInput, color: theme.textPrimary, borderRadius: radius.md }]}
            value={title}
            onChangeText={setTitle}
            placeholder="What are you up to?"
            placeholderTextColor={theme.textTertiary}
            maxLength={80}
          />
        </Section>

        {/* Category */}
        <Section label="Category">
          <View style={styles.categoryGrid}>
            {CATEGORIES.map(cat => {
              const selected = cat === category;
              return (
                <Pressable
                  key={cat}
                  onPress={() => setCategory(cat)}
                  style={[
                    styles.catChip,
                    {
                      backgroundColor: selected ? theme.primary : theme.bgCard,
                      borderRadius: radius.md,
                    },
                  ]}
                >
                  <CategoryIcon category={cat} size={16} color={selected ? '#fff' : theme.textSecondary} />
                  <Text
                    style={[
                      typography.subhead,
                      { color: selected ? '#fff' : theme.textSecondary, marginLeft: spacing.xs },
                    ]}
                  >
                    {CATEGORY_LABELS[cat]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Section>

        {/* Date & Time */}
        <Section label="When">
          <View style={styles.row}>
            <Pressable
              onPress={() => setShowDatePicker(true)}
              style={[styles.datePart, { backgroundColor: theme.bgInput, borderRadius: radius.md }]}
            >
              <Text style={[typography.body, { color: theme.textPrimary }]}>{formattedDate}</Text>
            </Pressable>
            <Pressable
              onPress={() => setShowTimePicker(true)}
              style={[styles.datePart, { backgroundColor: theme.bgInput, borderRadius: radius.md }]}
            >
              <Text style={[typography.body, { color: theme.textPrimary }]}>{formattedTime}</Text>
            </Pressable>
          </View>
          {showDatePicker && (
            <DateTimePicker
              value={date}
              mode="date"
              minimumDate={new Date()}
              onChange={(_, selected) => {
                setShowDatePicker(false);
                if (selected) {
                  const next = new Date(selected);
                  next.setHours(date.getHours(), date.getMinutes());
                  setDate(next);
                }
              }}
            />
          )}
          {showTimePicker && (
            <DateTimePicker
              value={date}
              mode="time"
              onChange={(_, selected) => {
                setShowTimePicker(false);
                if (selected) setDate(selected);
              }}
            />
          )}
        </Section>

        {/* Location */}
        <Section label="Where">
          <TextInput
            style={[styles.input, { backgroundColor: theme.bgInput, color: theme.textPrimary, borderRadius: radius.md }]}
            value={locationName}
            onChangeText={setLocationName}
            placeholder="Place name or address"
            placeholderTextColor={theme.textTertiary}
          />
        </Section>

        {/* Max participants */}
        <Section label="Participant limit (optional)">
          <TextInput
            style={[styles.input, { backgroundColor: theme.bgInput, color: theme.textPrimary, borderRadius: radius.md }]}
            value={maxParticipants}
            onChangeText={setMaxParticipants}
            placeholder="Unlimited"
            placeholderTextColor={theme.textTertiary}
            keyboardType="number-pad"
          />
        </Section>

        {/* Description */}
        <Section label="Description (optional)">
          <TextInput
            style={[
              styles.input,
              styles.textarea,
              { backgroundColor: theme.bgInput, color: theme.textPrimary, borderRadius: radius.md },
            ]}
            value={description}
            onChangeText={setDescription}
            placeholder="Any extra details…"
            placeholderTextColor={theme.textTertiary}
            multiline
            numberOfLines={3}
          />
        </Section>

        {/* Visibility */}
        <Section label="Visibility">
          <View style={[styles.visibilityRow, { backgroundColor: theme.bgCard, borderRadius: radius.lg }]}>
            <View style={{ flex: 1 }}>
              <Text style={[typography.callout, { color: theme.textPrimary }]}>
                {visibility === 'followers' ? 'Followers' : 'Private'}
              </Text>
              <Text style={[typography.subhead, { color: theme.textSecondary, marginTop: 2 }]}>
                {visibility === 'followers'
                  ? 'Visible to all mutual follows'
                  : 'Only visible to people you invite'}
              </Text>
            </View>
            <Switch
              value={visibility === 'private'}
              onValueChange={v => setVisibility(v ? 'private' : 'followers')}
              trackColor={{ true: theme.primary }}
            />
          </View>
        </Section>

        <Button label="Publish" onPress={submit} loading={loading} style={{ marginTop: spacing.sm }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View style={{ marginBottom: spacing.lg }}>
      <Text style={[typography.subhead, { color: theme.textSecondary, marginBottom: spacing.xs }]}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: {
    padding: spacing.lg,
    paddingTop: 60,
    paddingBottom: spacing['4xl'],
    gap: 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing['2xl'],
  },
  input: {
    height: 52,
    paddingHorizontal: spacing.lg,
    fontSize: 15,
  },
  textarea: {
    height: 90,
    paddingTop: spacing.md,
    textAlignVertical: 'top',
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs + 2,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  datePart: {
    flex: 1,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  visibilityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
  },
});
