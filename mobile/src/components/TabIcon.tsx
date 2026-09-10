import { Text, StyleSheet } from "react-native";

const SYMBOLS: Record<string, string> = {
  today: "\u25C9",
  work: "\u2630",
  plan: "\u25F7",
  social: "\u2661",
  me: "\u25CB",
};

interface TabIconProps {
  name: string;
  color: string;
  size?: number;
}

export function TabIcon({ name, color, size = 22 }: TabIconProps) {
  return (
    <Text style={[styles.icon, { color, fontSize: size }]}>
      {SYMBOLS[name] ?? "\u25CB"}
    </Text>
  );
}

const styles = StyleSheet.create({
  icon: {
    textAlign: "center",
  },
});
