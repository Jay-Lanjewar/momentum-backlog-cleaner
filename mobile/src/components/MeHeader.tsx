import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";

interface MeHeaderProps {
  /** Screen name used for the back button testID, e.g. "settings". */
  screen: string;
  title: string;
}

export function MeHeader({ screen, title }: MeHeaderProps) {
  const router = useRouter();

  return (
    <View style={styles.headerRow}>
      <TouchableOpacity
        style={styles.side}
        onPress={() => router.back()}
        activeOpacity={0.6}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        testID={`${screen}-back`}
      >
        <Text style={styles.backArrow}>{"\u2190"}</Text>
      </TouchableOpacity>
      <Text style={styles.header} numberOfLines={1}>
        {title}
      </Text>
      <View style={styles.side} />
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 16,
    paddingBottom: 20,
  },
  side: {
    width: 44,
    height: 44,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  backArrow: {
    color: "#2563EB",
    fontSize: 22,
    fontWeight: "600",
  },
  header: {
    color: "#F8FAFC",
    fontSize: 26,
    fontWeight: "700",
  },
});
