import { StyleSheet } from 'react-native';
import { colors, radius, spacing, typography } from '../theme/colors';

export const loginStyles = StyleSheet.create({
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
  logo: {
    width: 200,
    height: 200,
    resizeMode: 'contain',
    alignSelf: 'center',
    
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
    marginBottom: 20,
  },
  form: {
    gap: spacing.sm,
    marginBottom: 20,
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
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    alignItems: 'center',
    marginTop: 10,
    height: 40,
    
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
    fontWeight: '500',
    marginTop: 10,
    
  },
  helperText: {
    color: colors.mutedForeground,
    textAlign: 'center',
    fontSize: typography.small,
    marginTop: spacing.sm,
    fontWeight: '300',
  },
});

