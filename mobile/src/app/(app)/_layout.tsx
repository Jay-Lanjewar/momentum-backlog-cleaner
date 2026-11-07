import { Tabs } from "expo-router";
import { TabIcon } from "@/components/TabIcon";
import { useTheme } from "@/theme/ThemeProvider";

export const unstable_settings = {
  initialRouteName: "(today)",
};

export default function AppLayout() {
  const { colors } = useTheme();

  return (
    <Tabs
      initialRouteName="(today)"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.mutedText,
        tabBarStyle: {
          backgroundColor: colors.tabBar,
          borderTopColor: colors.tabBarBorder,
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
        name="(progress)"
        options={{
          title: "Progress",
          tabBarIcon: ({ color, size }) => (
            <TabIcon name="progress" color={color as string} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="(social)"
        options={{
          href: null,
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
      <Tabs.Screen
        name="index"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}
