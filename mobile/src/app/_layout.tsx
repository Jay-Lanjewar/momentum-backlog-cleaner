import { useEffect } from "react";
import { Slot, useRouter, useSegments } from "expo-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";

import { useAuthStore } from "@/store/useAuthStore";
import { useAuth } from "@/hooks/useAuth";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 1000 * 60 * 5, retry: 1 },
  },
});

function AuthGate() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === "(auth)";
    const inOnboardingGroup = segments[0] === "(onboarding)";

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
    }
  }, [isAuthenticated, isLoading, user, segments, router]);

  useEffect(() => {
    if (!isLoading) {
      SplashScreen.hideAsync();
    }
  }, [isLoading]);

  return null;
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthGate />
      <Slot />
      <StatusBar style="auto" />
    </QueryClientProvider>
  );
}
