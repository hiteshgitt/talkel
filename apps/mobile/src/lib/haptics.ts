import * as Haptics from 'expo-haptics';

/**
 * Light touch feedback. Silently does nothing on app builds without the haptics module
 * (or when the phone has vibration turned off).
 */
const safe = (p: () => Promise<void>) => {
  try {
    void p().catch(() => undefined);
  } catch {
    // module not in this build
  }
};

export const haptic = {
  tap: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  press: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  select: () => safe(() => Haptics.selectionAsync()),
  success: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  warning: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
};
