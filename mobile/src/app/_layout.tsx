import { useEffect } from "react";
import {
  ActivityIndicator,
  Image,
  StyleSheet,
  View,
} from "react-native";
import { Slot, useRouter, useSegments } from "expo-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import * as Notifications from "expo-notifications";

import {
  restoreSession,
  subscribeToAuthState,
  useAuth,
} from "@/hooks/useAuth";
import { useAuthStore } from "@/store/useAuthStore";
import {
  setNotificationHandler,
  createNotificationChannels,
} from "@/services/notifications";
import { performanceMark } from "@/lib/performance";

setNotificationHandler();
SplashScreen.preventAutoHideAsync();
performanceMark("startup.begin");

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 1000 * 60 * 5, retry: 1 },
  },
});

function AuthGate() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const confirming = useAuthStore((s) => s.confirming);
  const mfaRequired = useAuthStore((s) => s.mfaRequired);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    void restoreSession();
    return subscribeToAuthState(clearAuth);
  }, [clearAuth]);

  useEffect(() => {
    if (isLoading || confirming) return;

    const inAuthGroup = segments[0] === "(auth)";
    const inOnboardingGroup = segments[0] === "(onboarding)";
    const inConfirmRoute = (segments[0] as string) === "confirm";
    const inResetRoute =
      segments[0] === "(auth)" && (segments[1] as string) === "reset-password";

    if (inConfirmRoute) return;
    if (inResetRoute) return;

    // Pending 2-step challenge: nothing else may route until the code is
    // proven (login and restore both stop short of loading a profile).
    if (mfaRequired) {
      const inTwoFactorRoute =
        segments[0] === "(auth)" && (segments[1] as string) === "two-factor";
      if (!inTwoFactorRoute) {
        router.replace("/(auth)/two-factor");
      }
      return;
    }

    if (!isAuthenticated && !inAuthGroup) {
      router.replace("/(auth)/login");
    } else if (isAuthenticated && inAuthGroup) {
      const hasProfile = !!user?.profile;
      if (hasProfile) {
        router.replace("/(app)");
      } else {
        router.replace("/(onboarding)");
      }
    } else if (isAuthenticated && inOnboardingGroup) {
      const hasProfile = !!user?.profile;
      if (hasProfile) {
        router.replace("/(app)");
      }
    } else if (isAuthenticated && !user?.profile) {
      // Authenticated but profile-less outside auth/onboarding
      // (e.g. after email confirmation). Send to onboarding.
      router.replace("/(onboarding)");
    }
  }, [isAuthenticated, isLoading, confirming, mfaRequired, user, segments, router]);

  return null;
}

function StartupLoadingScreen() {
  useEffect(() => {
    performanceMark("startup.branded_loading.ready");
    performanceMark("startup.splash_hide.requested");
    void SplashScreen.hideAsync();
  }, []);

  return (
    <View style={styles.startupLoading} testID="startup-loading">
      <Image
        source={require("../../assets/branding/momentum-logo.png")}
        style={styles.startupLogo}
        resizeMode="contain"
        accessibilityLabel="Momentum"
      />
      <ActivityIndicator size="large" color="#2563EB" />
    </View>
  );
}

function isSafeRouteForAuthState(
  segments: string[],
  {
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
  },
): boolean {
  const inAuthGroup = segments[0] === "(auth)";
  const inAppGroup = segments[0] === "(app)";
  const inOnboardingGroup = segments[0] === "(onboarding)";
  const inConfirmRoute = segments[0] === "confirm";
  const inResetRoute = inAuthGroup && segments[1] === "reset-password";
  const inTwoFactorRoute = inAuthGroup && segments[1] === "two-factor";

  // These routes are intentionally safe to mount while the session is being
  // established because they perform the confirmation/recovery flow.
  if (inConfirmRoute || inResetRoute) return true;
  if (isLoading) return false;
  if (mfaRequired) return inTwoFactorRoute;
  if (confirming) return false;
  if (!isAuthenticated) return inAuthGroup;
  if (!hasProfile) return inOnboardingGroup;
  return inAppGroup;
}

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const confirming = useAuthStore((s) => s.confirming);
  const mfaRequired = useAuthStore((s) => s.mfaRequired);

  useEffect(() => {
    createNotificationChannels();
  }, []);

  useEffect(() => {
    function redirect(notification: Notifications.Notification) {
      const url = notification.request.content.data?.url;
      if (typeof url === "string") {
        router.push(url as any);
      }
    }

    const response = Notifications.getLastNotificationResponse();
    if (response?.notification) {
      redirect(response.notification);
    }

    const subscription = Notifications.addNotificationResponseReceivedListener(
      (resp) => redirect(resp.notification),
    );

    return () => subscription.remove();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthGate />
      {isSafeRouteForAuthState(segments as string[], {
        isLoading,
        confirming,
        mfaRequired,
        isAuthenticated,
        hasProfile: !!user?.profile,
      }) ? (
        <Slot />
      ) : (
        <StartupLoadingScreen />
      )}
      <StatusBar style="auto" />
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  startupLoading: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    flex: 1,
    justifyContent: "center",
    gap: 24,
  },
  startupLogo: {
    height: 148,
    width: 148,
  },
});
