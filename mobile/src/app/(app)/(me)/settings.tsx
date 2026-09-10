import { View, Text, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { useRouter } from "expo-router";

import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/useAuthStore";

export default function SettingsScreen() {
  const router = useRouter();
  const { user, clearAuth } = useAuthStore();

  async function handleSignOut() {
    const confirmed = await new Promise<boolean>((resolve) => {
      Alert.alert("Sign Out", "Are you sure you want to sign out?", [
        { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
        { text: "Sign Out", style: "destructive", onPress: () => resolve(true) },
      ]);
    });

    if (!confirmed) return;

    await supabase.auth.signOut();
    clearAuth();
    router.replace("/(auth)/login");
  }

  return (
    <View style={styles.container}>
      <View style={styles.profileSection}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {user?.name?.charAt(0).toUpperCase() ?? "S"}
          </Text>
        </View>
        <View>
          <Text style={styles.name}>{user?.name ?? "Student"}</Text>
          <Text style={styles.email}>{user?.email ?? ""}</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionHeader}>Account</Text>
        <TouchableOpacity style={styles.row} activeOpacity={0.6}>
          <Text style={styles.rowText}>Edit Profile</Text>
          <Text style={styles.arrow}>{"\u2192"}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.row} activeOpacity={0.6}>
          <Text style={styles.rowText}>Change Password</Text>
          <Text style={styles.arrow}>{"\u2192"}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionHeader}>App</Text>
        <TouchableOpacity style={styles.row} activeOpacity={0.6}>
          <Text style={styles.rowText}>Notifications</Text>
          <Text style={styles.arrow}>{"\u2192"}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.row} activeOpacity={0.6}>
          <Text style={styles.rowText}>Theme</Text>
          <Text style={styles.arrow}>{"\u2192"}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <TouchableOpacity
          style={styles.signOutButton}
          onPress={handleSignOut}
          activeOpacity={0.8}
        >
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.version}>Momentum v0.1.0</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FAFAFA", paddingHorizontal: 16, paddingTop: 16 },
  profileSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    padding: 16,
    backgroundColor: "#FFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    marginBottom: 24,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: "#FFF", fontSize: 24, fontWeight: "700" },
  name: { fontSize: 18, fontWeight: "700", color: "#1A1A1A" },
  email: { fontSize: 14, color: "#666", marginTop: 2 },
  section: { marginBottom: 24 },
  sectionHeader: {
    fontSize: 13,
    fontWeight: "600",
    color: "#999",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
    marginLeft: 4,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    padding: 16,
    marginBottom: 4,
  },
  rowText: { fontSize: 16, color: "#1A1A1A" },
  arrow: { fontSize: 16, color: "#999" },
  signOutButton: {
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: "#FECACA",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
  },
  signOutText: { fontSize: 16, fontWeight: "600", color: "#EF4444" },
  version: {
    fontSize: 12,
    color: "#999",
    textAlign: "center",
    marginTop: 16,
  },
});
