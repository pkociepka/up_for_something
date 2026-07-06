import { useColorScheme } from 'react-native';

const light = {
  // Brand
  primary: '#FF6B35',
  primarySubtle: '#FFF0EB',
  primaryPressed: '#E55A25',

  // Backgrounds
  bgScreen: '#F2F2F7',
  bgCard: '#FFFFFF',
  bgElevated: '#FFFFFF',
  bgInput: '#F2F2F7',

  // Text
  textPrimary: '#1C1C1E',
  textSecondary: '#636366',
  textTertiary: '#8E8E93',
  textOnPrimary: '#FFFFFF',

  // Semantic
  success: '#30D158',
  successSubtle: '#E8F8EE',
  danger: '#FF453A',
  dangerSubtle: '#FFE5E3',
  info: '#0A84FF',

  // Separators
  separator: '#E5E5EA',
  separatorLight: '#F2F2F7',
} as const;

const dark = {
  // Brand
  primary: '#FF6B35',
  primarySubtle: '#3D1A0A',
  primaryPressed: '#E55A25',

  // Backgrounds
  bgScreen: '#000000',
  bgCard: '#1C1C1E',
  bgElevated: '#2C2C2E',
  bgInput: '#2C2C2E',

  // Text
  textPrimary: '#FFFFFF',
  textSecondary: '#9A9AAF',
  textTertiary: '#636370',
  textOnPrimary: '#FFFFFF',

  // Semantic
  success: '#32D74B',
  successSubtle: '#0C2A14',
  danger: '#FF453A',
  dangerSubtle: '#2D0D0C',
  info: '#0A84FF',

  // Separators
  separator: '#38383A',
  separatorLight: '#2C2C2E',
} as const;

export type Theme = {
  primary: string;
  primarySubtle: string;
  primaryPressed: string;
  bgScreen: string;
  bgCard: string;
  bgElevated: string;
  bgInput: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  textOnPrimary: string;
  success: string;
  successSubtle: string;
  danger: string;
  dangerSubtle: string;
  info: string;
  separator: string;
  separatorLight: string;
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 9999,
} as const;

export const typography = {
  display:  { fontSize: 26, fontWeight: '800' as const, lineHeight: 30 },
  title1:   { fontSize: 22, fontWeight: '800' as const, lineHeight: 26 },
  title2:   { fontSize: 19, fontWeight: '700' as const, lineHeight: 23 },
  title3:   { fontSize: 17, fontWeight: '700' as const, lineHeight: 22 },
  callout:  { fontSize: 15, fontWeight: '600' as const, lineHeight: 21 },
  body:     { fontSize: 15, fontWeight: '400' as const, lineHeight: 22 },
  subhead:  { fontSize: 13, fontWeight: '500' as const, lineHeight: 18 },
  footnote: { fontSize: 12, fontWeight: '500' as const, lineHeight: 16 },
  caption:  { fontSize: 11, fontWeight: '700' as const, lineHeight: 14, letterSpacing: 0.4, textTransform: 'uppercase' as const },
} as const;

export function useTheme(): Theme {
  const scheme = useColorScheme();
  return scheme === 'dark' ? dark : light;
}

export { light as lightTheme, dark as darkTheme };
