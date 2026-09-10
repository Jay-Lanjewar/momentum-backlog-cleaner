import { Stack } from "expo-router";

export default function PlanLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="schedule" />
      <Stack.Screen name="plan" />
    </Stack>
  );
}
