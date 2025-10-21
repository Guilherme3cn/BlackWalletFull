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

