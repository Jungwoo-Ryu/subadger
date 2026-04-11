export const STORAGE = {
  userId: "@subadger/user_id",
  token: "@subadger/access_token",
  onboardingDone: "@subadger/onboarding_done",
} as const;

/** Per-user: profile wizard completed after sign-up (seeker vs owner flows). */
export function profileOnboardingKey(userId: string, role: "seeker" | "owner"): string {
  return `@subadger/profile_onboarding_v1_${role}_${userId}`;
}
