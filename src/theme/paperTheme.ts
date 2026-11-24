import {MD3LightTheme} from 'react-native-paper';
import {colors} from './colors';

export const paperTheme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: colors.primary,
    primaryContainer: colors.surface,
    secondary: colors.cyan,
    secondaryContainer: colors.surface,
    background: colors.background,
    surface: colors.white,
    surfaceVariant: colors.surface,
    onPrimary: colors.white,
    onSecondary: colors.text,
    onBackground: colors.text,
    onSurface: colors.text,
    onSurfaceVariant: colors.textSecondary,
    outline: colors.primary,
    outlineVariant: colors.border,
    error: colors.error,
    onError: colors.white,
  },
};
