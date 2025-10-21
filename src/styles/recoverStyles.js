import { StyleSheet } from 'react-native';
import { colors, radius, spacing, typography } from '../theme/colors';

export const recoverStyles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  keyboard: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    gap: spacing.lg,
  },
  header: {
    gap: spacing.sm,
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
  form: {
    gap: spacing.md,
  },
  label: {
    color: colors.foreground,
    fontSize: typography.small,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  input: {
    backgroundColor: colors.secondary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.foreground,
    borderWidth: 1,
    borderColor: colors.muted,
    fontSize: typography.body,
  },
  seedInput: {
    textAlignVertical: 'top',
    minHeight: 120,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  disabledButton: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: colors.primaryText,
    fontWeight: '700',
    fontSize: typography.body,
  },
  secondaryButton: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  secondaryButtonText: {
    color: colors.primary,
    fontWeight: '600',
    fontSize: typography.body,
  },
});
