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
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    width: '100%',
    backgroundColor: colors.secondary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalTitle: {
    color: colors.primary,
    fontSize: typography.headline,
    fontWeight: '700',
  },
  qrScannerContainer: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  qrScanner: {
    width: '100%',
    height: '100%',
  },
  qrScannerHint: {
    color: colors.mutedForeground,
    fontSize: typography.small,
    textAlign: 'center',
  },
  qrScannerCancel: {
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.muted,
    alignItems: 'center',
  },
  qrScannerCancelText: {
    color: colors.foreground,
    fontWeight: '600',
    fontSize: typography.small,
  },
  receiveModalQr: {
    width: 240,
    height: 240,
    borderRadius: radius.sm,
    backgroundColor: colors.background,
  },
  modalFallback: {
    color: colors.mutedForeground,
    textAlign: 'center',
    fontSize: typography.small,
  },
  modalAddress: {
    color: colors.foreground,
    fontSize: typography.small,
    textAlign: 'center',
    paddingHorizontal: spacing.sm,
  },
  sendModalOptions: {
    width: '100%',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  modalOptionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  modalOptionButtonText: {
    color: colors.primaryText,
    fontWeight: '600',
    fontSize: typography.small,
  },
  modalDividerText: {
    color: colors.mutedForeground,
    fontSize: typography.small,
    textAlign: 'center',
  },
  modalInput: {
    width: '100%',
    backgroundColor: colors.background,
    color: colors.foreground,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    fontSize: typography.body,
  },
  modalPrimaryButton: {
    width: '100%',
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  modalPrimaryButtonText: {
    color: colors.primaryText,
    fontWeight: '600',
    fontSize: typography.body,
  },
  modalClose: {
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  modalCloseText: {
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

