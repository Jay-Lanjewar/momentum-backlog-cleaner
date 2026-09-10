import { Stack } from "expo-router";

export default function WorkLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[id]" />
      <Stack.Screen name="courses" />
      <Stack.Screen name="goals" />
    </Stack>
  );
}
