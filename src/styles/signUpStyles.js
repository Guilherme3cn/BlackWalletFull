import { StyleSheet } from 'react-native';
import { colors, radius, spacing, typography } from '../theme/colors';

export const signUpStyles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
  },
  container: {
    flex: 1,
    padding: spacing.lg,
    justifyContent: 'center',
    gap: spacing.lg,
  },
  header: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    color: colors.primary,
    fontSize: typography.title,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.mutedForeground,
    fontSize: typography.body,
    textAlign: 'center',
  },
  form: {
    gap: spacing.sm,
  },
  label: {
    color: colors.foreground,
    fontSize: typography.small,
  },
  input: {
    backgroundColor: colors.secondary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.foreground,
    borderWidth: 1,
    borderColor: colors.muted,
  },
  primaryButton: {
    marginTop: spacing.md,
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: colors.primaryText,
    fontWeight: '700',
    fontSize: typography.body,
  },
  link: {
    color: colors.primary,
    textAlign: 'center',
    fontSize: typography.body,
    fontWeight: '600',
  },
  helperText: {
    color: colors.mutedForeground,
    textAlign: 'center',
    fontSize: typography.small,
    marginTop: spacing.sm,
  },
});
