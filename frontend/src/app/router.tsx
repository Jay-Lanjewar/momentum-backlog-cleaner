import { lazy, Suspense } from "react";
import { createBrowserRouter } from "react-router-dom";

import { ProtectedRoute, PublicOnlyRoute } from "@/components/auth/ProtectedRoute";
import { Skeleton } from "@/components/ui/skeleton";
import { TodayMissionPage } from "@/pages/TodayMissionPage";
import { LoginPage } from "@/pages/LoginPage";
import { RegisterPage } from "@/pages/RegisterPage";
import { ForgotPasswordPage } from "@/pages/ForgotPasswordPage";

const OnboardingPage = lazy(() => import("@/pages/OnboardingPage").then((m) => ({ default: m.OnboardingPage })));
const FocusModePage = lazy(() => import("@/pages/FocusModePage").then((m) => ({ default: m.FocusModePage })));
const PlanPage = lazy(() => import("@/pages/PlanPage").then((m) => ({ default: m.PlanPage })));
const BacklogPage = lazy(() => import("@/pages/BacklogPage").then((m) => ({ default: m.BacklogPage })));
const CoursesPage = lazy(() => import("@/pages/CoursesPage").then((m) => ({ default: m.CoursesPage })));
const SchedulePage = lazy(() => import("@/pages/SchedulePage").then((m) => ({ default: m.SchedulePage })));
const ProfilePage = lazy(() => import("@/pages/ProfilePage").then((m) => ({ default: m.ProfilePage })));
const HealthPage = lazy(() => import("@/pages/HealthPage").then((m) => ({ default: m.HealthPage })));
const FriendsPage = lazy(() => import("@/pages/FriendsPage").then((m) => ({ default: m.FriendsPage })));
const FeedPage = lazy(() => import("@/pages/FeedPage").then((m) => ({ default: m.FeedPage })));

function PageFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-4 p-8">
        <Skeleton className="h-8 w-32 mx-auto" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-12 w-full rounded-xl" />
      </div>
    </div>
  );
}

export const router = createBrowserRouter([
  // Auth pages (public-only)
  {
    path: "/login",
    element: (
      <PublicOnlyRoute>
        <LoginPage />
      </PublicOnlyRoute>
    ),
  },
  {
    path: "/register",
    element: (
      <PublicOnlyRoute>
        <RegisterPage />
      </PublicOnlyRoute>
    ),
  },
  {
    path: "/forgot-password",
    element: (
      <PublicOnlyRoute>
        <ForgotPasswordPage />
      </PublicOnlyRoute>
    ),
  },
  // Protected pages
  {
    path: "/",
    element: (
      <ProtectedRoute>
        <TodayMissionPage />
      </ProtectedRoute>
    ),
  },
  {
    path: "/onboarding",
    element: (
      <ProtectedRoute>
        <Suspense fallback={<PageFallback />}>
          <OnboardingPage />
        </Suspense>
      </ProtectedRoute>
    ),
  },
  {
    path: "/focus",
    element: (
      <ProtectedRoute>
        <Suspense fallback={<PageFallback />}>
          <FocusModePage />
        </Suspense>
      </ProtectedRoute>
    ),
  },
  {
    path: "/plan",
    element: (
      <ProtectedRoute>
        <Suspense fallback={<PageFallback />}>
          <PlanPage />
        </Suspense>
      </ProtectedRoute>
    ),
  },
  {
    path: "/backlog",
    element: (
      <ProtectedRoute>
        <Suspense fallback={<PageFallback />}>
          <BacklogPage />
        </Suspense>
      </ProtectedRoute>
    ),
  },
  {
    path: "/courses",
    element: (
      <ProtectedRoute>
        <Suspense fallback={<PageFallback />}>
          <CoursesPage />
        </Suspense>
      </ProtectedRoute>
    ),
  },
  {
    path: "/schedule",
    element: (
      <ProtectedRoute>
        <Suspense fallback={<PageFallback />}>
          <SchedulePage />
        </Suspense>
      </ProtectedRoute>
    ),
  },
  {
    path: "/profile",
    element: (
      <ProtectedRoute>
        <Suspense fallback={<PageFallback />}>
          <ProfilePage />
        </Suspense>
      </ProtectedRoute>
    ),
  },
  {
    path: "/health",
    element: (
      <ProtectedRoute>
        <Suspense fallback={<PageFallback />}>
          <HealthPage />
        </Suspense>
      </ProtectedRoute>
    ),
  },
  {
    path: "/friends",
    element: (
      <ProtectedRoute>
        <Suspense fallback={<PageFallback />}>
          <FriendsPage />
        </Suspense>
      </ProtectedRoute>
    ),
  },
  {
    path: "/feed",
    element: (
      <ProtectedRoute>
        <Suspense fallback={<PageFallback />}>
          <FeedPage />
        </Suspense>
      </ProtectedRoute>
    ),
  },
]);
