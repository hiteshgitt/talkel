import { requireOptionalNativeModule } from 'expo';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { TurboModuleRegistry } from 'react-native';

/**
 * Calls need native WebRTC, which only exists in our own builds (EAS development/production),
 * not in the Expo Go app. Returns a user-facing explanation when calling can't work here.
 */
export function nativeCallingProblem(): string | null {
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
    return 'Calls need the Talkel development build. Expo Go does not include the audio calling module.';
  }
  return null;
}

/** Recording playback needs the audio module, which only newer app builds include. */
export function audioPlaybackAvailable(): boolean {
  return requireOptionalNativeModule('ExpoAudio') !== null;
}

/** Gradients, vector graphics and haptics arrived in a later app build; older builds fall back to plain views. */
export const gradientsAvailable = requireOptionalNativeModule('ExpoLinearGradient') !== null;
export const svgAvailable = TurboModuleRegistry.get('RNSVGSvgViewModule') != null;
