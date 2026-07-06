import { ActivityIndicator, Pressable, StyleSheet, Text, ViewStyle } from 'react-native';
import { useTheme, radius, typography } from '@/src/theme';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  style,
}: ButtonProps) {
  const theme = useTheme();
  const isDisabled = disabled || loading;

  const bg: Record<Variant, string> = {
    primary:   theme.primary,
    secondary: theme.bgCard,
    danger:    theme.dangerSubtle,
    ghost:     'transparent',
  };

  const textColor: Record<Variant, string> = {
    primary:   theme.textOnPrimary,
    secondary: theme.textPrimary,
    danger:    theme.danger,
    ghost:     theme.primary,
  };

  const borderColor: Record<Variant, string | undefined> = {
    primary:   undefined,
    secondary: theme.separator,
    danger:    theme.danger,
    ghost:     undefined,
  };

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.btn,
        {
          backgroundColor: bg[variant],
          borderColor: borderColor[variant],
          borderWidth: borderColor[variant] ? 1 : 0,
          opacity: isDisabled ? 0.5 : pressed ? 0.85 : 1,
          borderRadius: radius.xl,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={textColor[variant]} size="small" />
      ) : (
        <Text style={[typography.callout, { color: textColor[variant] }]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
});
