import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Link } from 'expo-router';
import { supabase } from '@/src/lib/supabase';
import { useTheme, spacing, radius, typography } from '@/src/theme';
import { Button } from '@/src/components/ui/Button';

export default function SignUpScreen() {
  const theme = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);

  async function signUp() {
    if (!email || !password || !displayName || !username) {
      Alert.alert('Missing fields', 'Please fill in all fields.');
      return;
    }
    if (!/^[a-z0-9_]{3,30}$/.test(username)) {
      Alert.alert(
        'Invalid username',
        'Username must be 3–30 characters: lowercase letters, numbers, and underscores only.',
      );
      return;
    }
    if (password.length < 8) {
      Alert.alert('Weak password', 'Password must be at least 8 characters.');
      return;
    }

    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          username: username.trim().toLowerCase(),
          display_name: displayName.trim(),
        },
      },
    });
    setLoading(false);

    if (error) {
      Alert.alert('Sign up failed', error.message);
      return;
    }

    // session is null when email confirmation is required
    if (!data.session) {
      setPendingEmail(email.trim());
    }
  }

  if (pendingEmail) {
    return <ConfirmationPending email={pendingEmail} onBack={() => setPendingEmail(null)} />;
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.bgScreen }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={[typography.title1, { color: theme.textPrimary }]}>Create account</Text>
          <Text style={[typography.body, { color: theme.textSecondary, marginTop: spacing.xs }]}>
            Join your friends and start coordinating.
          </Text>
        </View>

        <View style={styles.form}>
          {[
            { label: 'Display name', value: displayName, set: setDisplayName, placeholder: 'Your name', auto: 'name' as const },
            { label: 'Username', value: username, set: (v: string) => setUsername(v.toLowerCase()), placeholder: 'e.g. john_doe', auto: 'username' as const },
            { label: 'Email', value: email, set: setEmail, placeholder: 'you@example.com', auto: 'email' as const, keyboard: 'email-address' as const },
          ].map(field => (
            <View key={field.label} style={styles.field}>
              <Text style={[typography.subhead, { color: theme.textSecondary, marginBottom: spacing.xs }]}>
                {field.label}
              </Text>
              <TextInput
                style={[
                  styles.input,
                  { backgroundColor: theme.bgInput, color: theme.textPrimary, borderRadius: radius.md },
                ]}
                value={field.value}
                onChangeText={field.set}
                autoCapitalize="none"
                keyboardType={field.keyboard}
                placeholder={field.placeholder}
                placeholderTextColor={theme.textTertiary}
                autoComplete={field.auto}
              />
            </View>
          ))}

          <View style={styles.field}>
            <Text style={[typography.subhead, { color: theme.textSecondary, marginBottom: spacing.xs }]}>
              Password
            </Text>
            <TextInput
              style={[
                styles.input,
                { backgroundColor: theme.bgInput, color: theme.textPrimary, borderRadius: radius.md },
              ]}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="Min. 8 characters"
              placeholderTextColor={theme.textTertiary}
              autoComplete="new-password"
              textContentType="newPassword"
              onSubmitEditing={signUp}
              returnKeyType="go"
            />
          </View>

          <Button label="Create Account" onPress={signUp} loading={loading} style={{ marginTop: spacing.sm }} />
        </View>

        <View style={styles.footer}>
          <Text style={[typography.body, { color: theme.textSecondary }]}>Already have an account? </Text>
          <Link href="/(auth)/sign-in" asChild>
            <Pressable>
              <Text style={[typography.callout, { color: theme.primary }]}>Sign In</Text>
            </Pressable>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function ConfirmationPending({ email, onBack }: { email: string; onBack: () => void }) {
  const theme = useTheme();
  return (
    <View style={[styles.confirmation, { backgroundColor: theme.bgScreen }]}>
      <Text style={{ fontSize: 48 }}>📬</Text>
      <Text style={[typography.title2, { color: theme.textPrimary, marginTop: spacing.lg, textAlign: 'center' }]}>
        Check your inbox
      </Text>
      <Text style={[typography.body, { color: theme.textSecondary, marginTop: spacing.sm, textAlign: 'center' }]}>
        We sent a confirmation link to{'\n'}
        <Text style={{ color: theme.textPrimary, fontWeight: '600' }}>{email}</Text>
      </Text>
      <Text style={[typography.subhead, { color: theme.textTertiary, marginTop: spacing.lg, textAlign: 'center' }]}>
        Open the link in that email to activate your account, then sign in here.
      </Text>
      <Pressable onPress={onBack} style={{ marginTop: spacing['3xl'] }}>
        <Text style={[typography.callout, { color: theme.primary }]}>Use a different email</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 1,
    padding: spacing.lg,
    justifyContent: 'center',
    gap: spacing['2xl'],
  },
  header: {},
  form: { gap: spacing.md },
  field: {},
  input: {
    height: 52,
    paddingHorizontal: spacing.lg,
    fontSize: 15,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: spacing['2xl'],
  },
  confirmation: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing['3xl'],
  },
});
