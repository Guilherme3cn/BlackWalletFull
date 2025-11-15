import { StyleSheet } from 'react-native';
import { colors, radius, spacing, typography } from '../theme/colors';

export const seedPhraseStyles = StyleSheet.create({
  container: {
    backgroundColor: "#ffffff23",
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
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
    marginStart: -20,
    marginTop: -40,
    marginEnd: 20,
  },
  iconText: {
    fontSize: typography.body,
    color: colors.primary,
  },
  wordsBox: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  wordCard: {
    width: '30%',
    backgroundColor: "#66666527",
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    alignItems: 'flex-start',
    gap: spacing.xs,
  },
  wordIndex: {
    color: colors.mutedForeground,
    fontSize: typography.small,
  },
  wordText: {
    color: colors.foreground,
    fontFamily: 'monospace',
    fontSize: typography.small,
  },
  hint: {
    textAlign: 'center',
    color: colors.mutedForeground,
    fontSize: typography.small,
  },
});
