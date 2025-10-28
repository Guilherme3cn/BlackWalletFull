import { StyleSheet } from 'react-native';
import { colors, radius, spacing, typography } from '../theme/colors';

export const walletCardStyles = StyleSheet.create({
  card: {
    backgroundColor: '#4d4b4b73',
    padding: 10,
    borderRadius: radius.lg,
    gap: 10,
    borderWidth: 1,
    borderColor: '#1A1A1A',
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
    overflow: 'hidden',
    width: 350,
  },
  cardImage: {
    borderRadius: radius.lg,
    opacity: 0.95,
    width: '120%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
  },
  title: {
    color: colors.foreground,
    fontSize: typography.headline,
    fontWeight: '700',
  },
  subtitle: {
    color: '#D1D1D6',
    fontSize: typography.small,
    marginTop: spacing.xs,
  },
  headerButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  iconButton: {
    width: 45,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: '#20202010',
    borderWidth: 1,
    borderColor: '#2e2e2e57',
    alignItems: 'center',
    justifyContent: 'center',
    marginStart: -10,
    marginTop: -20,
    marginEnd: 10
  },
  iconButtonDisabled: {
    opacity: 0.4,
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
    color: colors.primary,
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
