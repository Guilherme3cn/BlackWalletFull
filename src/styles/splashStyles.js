import { StyleSheet } from 'react-native';
import { colors, spacing, typography } from '../theme/colors';

export const splashStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.lg,
  },
  logo: {
    width: 160,
    height: 160,
    resizeMode: 'contain',
  },
  title: {
    color: colors.primary,
    fontSize: typography.title,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    color: colors.mutedForeground,
    fontSize: typography.body,
    textAlign: 'center',
  },
});
