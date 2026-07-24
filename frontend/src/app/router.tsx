import { createBrowserRouter } from "react-router-dom";

import { ProtectedRoute, PublicOnlyRoute } from "@/components/auth/ProtectedRoute";
import { TodayMissionPage } from "@/pages/TodayMissionPage";
import { OnboardingPage } from "@/pages/OnboardingPage";
import { FocusModePage } from "@/pages/FocusModePage";
import { PlanPage } from "@/pages/PlanPage";
import { BacklogPage } from "@/pages/BacklogPage";
import { CoursesPage } from "@/pages/CoursesPage";
import { ProfilePage } from "@/pages/ProfilePage";
import { HealthPage } from "@/pages/HealthPage";
import { LoginPage } from "@/pages/LoginPage";
import { RegisterPage } from "@/pages/RegisterPage";
import { ForgotPasswordPage } from "@/pages/ForgotPasswordPage";

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
  // Protected pages (each page wraps itself with <Layout>)
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
        <OnboardingPage />
      </ProtectedRoute>
    ),
  },
  {
    path: "/focus",
    element: (
      <ProtectedRoute>
        <FocusModePage />
      </ProtectedRoute>
    ),
  },
  {
    path: "/plan",
    element: (
      <ProtectedRoute>
        <PlanPage />
      </ProtectedRoute>
    ),
  },
  {
    path: "/backlog",
    element: (
      <ProtectedRoute>
        <BacklogPage />
      </ProtectedRoute>
    ),
  },
  {
    path: "/courses",
    element: (
      <ProtectedRoute>
        <CoursesPage />
      </ProtectedRoute>
    ),
  },
  {
    path: "/profile",
    element: (
      <ProtectedRoute>
        <ProfilePage />
      </ProtectedRoute>
    ),
  },
  {
    path: "/health",
    element: (
      <ProtectedRoute>
        <HealthPage />
      </ProtectedRoute>
    ),
  },
]);
