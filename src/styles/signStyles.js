import { StyleSheet } from 'react-native';
import { colors, radius, spacing, typography } from '../theme/colors';

export const signStyles = StyleSheet.create({
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
    justifyContent: "center",
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
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
  modeSection: {
    gap: spacing.xs,
  },
  modeButtonsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  modeButton: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.muted,
    backgroundColor: colors.secondary,
    alignItems: 'center',
  },
  modeButtonActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  modeButtonText: {
    color: colors.foreground,
    fontWeight: '600',
    fontSize: typography.small,
  },
  modeButtonTextActive: {
    color: colors.primaryText,
  },
  modeDescription: {
    color: colors.mutedForeground,
    fontSize: typography.small,
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
  disabled: {
    opacity: 0.6,
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
    marginTop: 10,
  },
});

