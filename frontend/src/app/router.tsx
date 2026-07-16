import { createBrowserRouter } from "react-router-dom";

import { TodayMissionPage } from "@/pages/TodayMissionPage";
import { OnboardingPage } from "@/pages/OnboardingPage";
import { FocusModePage } from "@/pages/FocusModePage";
import { PlanPage } from "@/pages/PlanPage";
import { BacklogPage } from "@/pages/BacklogPage";
import { CoursesPage } from "@/pages/CoursesPage";
import { ProfilePage } from "@/pages/ProfilePage";
import { HealthPage } from "@/pages/HealthPage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <TodayMissionPage />,
  },
  {
    path: "/onboarding",
    element: <OnboardingPage />,
  },
  {
    path: "/focus",
    element: <FocusModePage />,
  },
  {
    path: "/plan",
    element: <PlanPage />,
  },
  {
    path: "/backlog",
    element: <BacklogPage />,
  },
  {
    path: "/courses",
    element: <CoursesPage />,
  },
  {
    path: "/profile",
    element: <ProfilePage />,
  },
  {
    path: "/health",
    element: <HealthPage />,
  },
]);
