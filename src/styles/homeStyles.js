import { StyleSheet } from 'react-native';
import { colors, radius, spacing, typography } from '../theme/colors';

export const homeStyles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: colors.background,
  },
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.lg,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: colors.mutedForeground,
    fontSize: typography.body,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
    alignItems: 'flex-start',
    flexWrap: 'wrap',
  },
  heading: {
    color: colors.primary,
    fontSize: typography.title,
    fontWeight: '700',
  },
  headingSubtitle: {
    color: colors.mutedForeground,
    marginTop: spacing.xs,
    fontSize: typography.small,
  },
  headerActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  quickActions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  quickActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.secondary,
  },
  quickActionIcon: {
    marginRight: spacing.sm,
  },
  quickActionText: {
    color: colors.primaryText,
    fontSize: typography.body,
    fontWeight: '600',
  },
  quickActionTextSecondary: {
    color: colors.foreground,
    fontSize: typography.body,
    fontWeight: '600',
  },
  sendButton: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  receiveButton: {
    backgroundColor: '#035820ff',
  },
  receiveModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  receiveModalCard: {
    width: '100%',
    backgroundColor: colors.secondary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  receiveModalTitle: {
    color: colors.primary,
    fontSize: typography.headline,
    fontWeight: '700',
  },
  receiveModalQr: {
    width: 240,
    height: 240,
    borderRadius: radius.sm,
    backgroundColor: colors.background,
  },
  receiveModalFallback: {
    color: colors.mutedForeground,
    textAlign: 'center',
    fontSize: typography.small,
  },
  receiveModalAddress: {
    color: colors.foreground,
    fontSize: typography.small,
    textAlign: 'center',
    paddingHorizontal: spacing.sm,
  },
  receiveModalClose: {
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
  },
  receiveModalCloseText: {
    color: colors.primaryText,
    fontWeight: '600',
    fontSize: typography.small,
  },
  headerButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: 'transparent',
  },
  headerButtonText: {
    color: colors.primary,
    fontWeight: '600',
    fontSize: typography.small,
  },
  outlineButton: {
    backgroundColor: 'transparent',
    marginLeft: 5,
  },
  dangerButton: {
    borderColor: '#ffd000ff',
    backgroundColor: '#ffd000e3',
    marginLeft: 80,
   
  },
  dangerButtonText: {
    color: '#000000', 
    fontSize: 20
  },
  disclaimer: {
    textAlign: 'center',
    color: colors.mutedForeground,
    fontSize: typography.small,
  },
  feedback: {
    padding: spacing.md,
    borderRadius: radius.md,
  },
  feedbackSuccess: {
    backgroundColor: '#5050509c',
  },
  feedbackError: {
    backgroundColor: '#ac0707ea',
  },
  feedbackText: {
    color: colors.foreground,
    textAlign: 'center',
    fontSize: typography.small,
  },
});

