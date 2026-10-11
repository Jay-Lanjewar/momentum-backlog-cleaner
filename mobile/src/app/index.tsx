import { Redirect } from "expo-router";

import { useAuthStore } from "@/store/useAuthStore";

export type LaunchRoute =
  | "/(auth)/login"
  | "/(onboarding)"
  | "/(app)/(today)"
  | null;

export function getLaunchRoute({
  isLoading,
  confirming,
  mfaRequired,
  isAuthenticated,
  hasProfile,
}: {
  isLoading: boolean;
  confirming: boolean;
  mfaRequired: boolean;
  isAuthenticated: boolean;
  hasProfile: boolean;
}): LaunchRoute {
  if (isLoading || confirming || mfaRequired) return null;
  if (!isAuthenticated) return "/(auth)/login";
  if (!hasProfile) return "/(onboarding)";
  return "/(app)/(today)";
}

export default function RootIndex() {
  const { isLoading, confirming, mfaRequired, isAuthenticated, user } =
    useAuthStore();
  const route = getLaunchRoute({
    isLoading,
    confirming,
    mfaRequired,
    isAuthenticated,
    hasProfile: !!user?.profile,
  });

  if (!route) return null;
  return <Redirect href={route} />;
}
