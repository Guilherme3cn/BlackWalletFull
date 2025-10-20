import { StyleSheet } from 'react-native';
import { colors, radius, spacing, typography } from '../theme/colors';

export const walletCardStyles = StyleSheet.create({
  card: {
    backgroundColor: "#ffffff27",
    padding: spacing.lg,
    borderRadius: radius.lg,
    gap: spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
  },
  title: {
    color: colors.primary,
    fontSize: typography.headline,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.mutedForeground,
    fontSize: typography.small,
    marginTop: spacing.xs,
  },
  headerButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: {
    color: colors.primary,
    fontSize: typography.body,
    fontWeight: '600',
  },
  section: {
    gap: spacing.xs,
  },
  label: {
    color: colors.mutedForeground,
    fontSize: typography.small,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  balanceText: {
    color: colors.foreground,
    fontSize: 32,
    fontWeight: '700',
  },
  usdText: {
    color: colors.mutedForeground,
    fontSize: typography.small,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  addressText: {
    flex: 1,
    color: colors.foreground,
    fontFamily: 'monospace',
    fontSize: typography.small,
    backgroundColor: colors.muted,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
  },
  copyButton: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  copyButtonText: {
    color: colors.primary,
    fontWeight: '600',
  },
});
