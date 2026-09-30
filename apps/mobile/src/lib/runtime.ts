import { requireOptionalNativeModule } from 'expo';
import Constants, { ExecutionEnvironment } from 'expo-constants';

/**
 * Calls need native WebRTC, which only exists in our own builds (EAS development/production),
 * not in the Expo Go app. Returns a user-facing explanation when calling can't work here.
 */
export function nativeCallingProblem(): string | null {
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
    return 'Calls need the SpeakAI development build. Expo Go does not include the audio calling module.';
  }
  return null;
}

/** Recording playback needs the audio module, which only newer app builds include. */
export function audioPlaybackAvailable(): boolean {
  return requireOptionalNativeModule('ExpoAudio') !== null;
}
