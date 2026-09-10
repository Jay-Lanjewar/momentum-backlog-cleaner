import { Tabs } from "expo-router";
import { TabIcon } from "@/components/TabIcon";

const COLORS = {
  active: "#2563EB",
  inactive: "#64748B",
  background: "#0F172A",
  tabBar: "#1E293B",
};

export default function AppLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: COLORS.active,
        tabBarInactiveTintColor: COLORS.inactive,
        tabBarStyle: {
          backgroundColor: COLORS.tabBar,
          borderTopColor: "#334155",
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
        },
      }}
    >
      <Tabs.Screen
        name="(today)"
        options={{
          title: "Today",
          tabBarIcon: ({ color, size }) => (
            <TabIcon name="today" color={color as string} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="(work)"
        options={{
          title: "Work",
          tabBarIcon: ({ color, size }) => (
            <TabIcon name="work" color={color as string} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="(plan)"
        options={{
          title: "Plan",
          tabBarIcon: ({ color, size }) => (
            <TabIcon name="plan" color={color as string} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="(social)"
        options={{
          title: "Social",
          tabBarIcon: ({ color, size }) => (
            <TabIcon name="social" color={color as string} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="(me)"
        options={{
          title: "Me",
          tabBarIcon: ({ color, size }) => (
            <TabIcon name="me" color={color as string} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
