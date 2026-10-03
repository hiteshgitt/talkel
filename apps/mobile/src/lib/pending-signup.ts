/**
 * Credentials of an account that was just created and still needs its email verified. Memory only
 * (never stored): lets the "check your email" screen sign the user in by itself once they've tapped
 * the link. If the app is closed in between, they simply sign in again.
 */
let pending: { email: string; password: string } | null = null;

export const pendingSignup = {
  set(email: string, password: string) {
    pending = { email, password };
  },
  get() {
    return pending;
  },
  clear() {
    pending = null;
  },
};
