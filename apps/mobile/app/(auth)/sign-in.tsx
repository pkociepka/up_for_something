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
import { Link, useRouter } from 'expo-router';
import { supabase } from '@/src/lib/supabase';
import { useTheme, spacing, radius, typography } from '@/src/theme';
import { Button } from '@/src/components/ui/Button';

export default function SignInScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function signIn() {
    if (!email || !password) {
      Alert.alert('Missing fields', 'Please enter your email and password.');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (error) Alert.alert('Sign in failed', error.message);
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
          <Text style={[typography.display, { color: theme.primary }]}>Up for{'\n'}Something?</Text>
          <Text style={[typography.body, { color: theme.textSecondary, marginTop: spacing.sm }]}>
            Sign in to see what your friends are up to.
          </Text>
        </View>

        <View style={styles.form}>
          <View style={styles.field}>
            <Text style={[typography.subhead, { color: theme.textSecondary, marginBottom: spacing.xs }]}>
              Email
            </Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: theme.bgInput,
                  color: theme.textPrimary,
                  borderRadius: radius.md,
                },
              ]}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              textContentType="emailAddress"
              placeholder="you@example.com"
              placeholderTextColor={theme.textTertiary}
            />
          </View>

          <View style={styles.field}>
            <Text style={[typography.subhead, { color: theme.textSecondary, marginBottom: spacing.xs }]}>
              Password
            </Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: theme.bgInput,
                  color: theme.textPrimary,
                  borderRadius: radius.md,
                },
              ]}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="current-password"
              textContentType="password"
              placeholder="••••••••"
              placeholderTextColor={theme.textTertiary}
              onSubmitEditing={signIn}
              returnKeyType="go"
            />
          </View>

          <Button label="Sign In" onPress={signIn} loading={loading} style={{ marginTop: spacing.sm }} />
        </View>

        <View style={styles.footer}>
          <Text style={[typography.body, { color: theme.textSecondary }]}>
            Don't have an account?{' '}
          </Text>
          <Link href="/(auth)/sign-up" asChild>
            <Pressable>
              <Text style={[typography.callout, { color: theme.primary }]}>Sign Up</Text>
            </Pressable>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 1,
    padding: spacing.lg,
    justifyContent: 'center',
    gap: spacing['2xl'],
  },
  header: {
    gap: spacing.xs,
  },
  form: {
    gap: spacing.md,
  },
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
});
