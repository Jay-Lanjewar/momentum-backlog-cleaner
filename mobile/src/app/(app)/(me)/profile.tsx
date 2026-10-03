import { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";

import { MeHeader } from "@/components/MeHeader";
import { useProfile, useSaveProfile } from "@/services/hooks";
import type { ProfileUpdatePayload, SleepTime, StudyWindow } from "@/services/types";
import { dateToTime, formatTime12h, timeToDate } from "@/lib/schedule";

const ENERGY_OPTIONS = ["morning", "afternoon", "evening", "night"];

type PickerKey = "sleep-start" | "sleep-end" | "study-start" | "study-end";

export default function ProfileEditScreen() {
  const { data: profile, isLoading } = useProfile();
  const saveProfile = useSaveProfile();

  const [name, setName] = useState("");
  const [className, setClassName] = useState("");
  const [board, setBoard] = useState("");
  const [energyPeak, setEnergyPeak] = useState<string | null>(null);
  const [dailyTarget, setDailyTarget] = useState("");
  const [sleepStart, setSleepStart] = useState("");
  const [sleepEnd, setSleepEnd] = useState("");
  const [studyStart, setStudyStart] = useState("");
  const [studyEnd, setStudyEnd] = useState("");
  const [picker, setPicker] = useState<PickerKey | null>(null);

  const timeValues: Record<PickerKey, string> = {
    "sleep-start": sleepStart,
    "sleep-end": sleepEnd,
    "study-start": studyStart,
    "study-end": studyEnd,
  };
  const timeSetters: Record<PickerKey, (value: string) => void> = {
    "sleep-start": setSleepStart,
    "sleep-end": setSleepEnd,
    "study-start": setStudyStart,
    "study-end": setStudyEnd,
  };

  function handleTimeChange(
    key: PickerKey,
    _event: DateTimePickerEvent,
    selectedDate?: Date,
  ) {
    if (Platform.OS === "android") setPicker(null);
    if (!selectedDate) return;
    timeSetters[key](dateToTime(selectedDate));
  }

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (profile) {
      setName(profile.name ?? "");
      setClassName(profile.class_name ?? "");
      setBoard(profile.board ?? "");
      setEnergyPeak(profile.energy_peak ?? null);
      setDailyTarget(profile.daily_target_minutes?.toString() ?? "");
      setSleepStart(profile.sleep_schedule?.start ?? "");
      setSleepEnd(profile.sleep_schedule?.end ?? "");
      setStudyStart(profile.preferred_study_window?.earliest_start ?? "");
      setStudyEnd(profile.preferred_study_window?.latest_end ?? "");
    }
  }, [profile]);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function handleSave() {
    const targetMinutes = dailyTarget ? parseInt(dailyTarget, 10) : null;
    if (dailyTarget && (isNaN(targetMinutes!) || targetMinutes! < 15 || targetMinutes! > 1440)) {
      Alert.alert("Invalid Target", "Daily target must be between 15 and 1440 minutes.");
      return;
    }

    const sleep_schedule: SleepTime | null =
      sleepStart && sleepEnd ? { start: sleepStart, end: sleepEnd } : null;
    const preferred_study_window: StudyWindow | null =
      studyStart && studyEnd ? { earliest_start: studyStart, latest_end: studyEnd } : null;

    const payload: ProfileUpdatePayload = {
      name: name || null,
      class_name: className || null,
      board: board || null,
      energy_peak: energyPeak,
      daily_target_minutes: targetMinutes,
      sleep_schedule,
      preferred_study_window,
    };

    try {
      await saveProfile.mutateAsync(payload);
      Alert.alert("Saved", "Your profile has been updated.");
    } catch {
      Alert.alert("Error", "Failed to save profile. Please try again.");
    }
  }

  function renderTimeField(
    label: string,
    key: PickerKey,
    placeholder: string,
    accessibilityLabel: string,
  ) {
    const value = timeValues[key];
    const display = value ? formatTime12h(value) : "Not set";
    const testID = `profile-${key}`;

    if (Platform.OS === "web") {
      return (
        <View style={styles.timeField}>
          <Text style={styles.timeLabel}>{label}</Text>
          <TextInput
            style={styles.timeInput}
            value={value}
            onChangeText={timeSetters[key]}
            placeholder={placeholder}
            placeholderTextColor="#64748B"
            testID={testID}
          />
        </View>
      );
    }

    return (
      <View style={styles.timeField}>
        <Text style={styles.timeLabel}>{label}</Text>
        <TouchableOpacity
          style={styles.timeBtn}
          onPress={() => setPicker(picker === key ? null : key)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          accessibilityValue={{ text: display }}
          testID={testID}
        >
          <Text style={styles.timeBtnText}>{display}</Text>
          <Text style={styles.timeBtnArrow}>{"\u2192"}</Text>
        </TouchableOpacity>
        {picker === key && (
          <DateTimePicker
            testID={`${testID}-picker`}
            value={timeToDate(value)}
            mode="time"
            is24Hour={false}
            display={Platform.OS === "ios" ? "spinner" : "default"}
            onChange={(event, date) => handleTimeChange(key, event, date)}
          />
        )}
      </View>
    );
  }

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={["bottom"]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2563EB" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <MeHeader screen="profile" title="Profile" />

          <View style={styles.section}>
            <Text style={styles.sectionHeader}>Personal Info</Text>
            <View style={styles.field}>
              <Text style={styles.label}>Name</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="Your name"
                placeholderTextColor="#64748B"
              />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Class</Text>
              <TextInput
                style={styles.input}
                value={className}
                onChangeText={setClassName}
                placeholder="e.g. 12th"
                placeholderTextColor="#64748B"
              />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Board</Text>
              <TextInput
                style={styles.input}
                value={board}
                onChangeText={setBoard}
                placeholder="e.g. CBSE"
                placeholderTextColor="#64748B"
              />
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionHeader}>Study Preferences</Text>
            <View style={styles.field}>
              <Text style={styles.label}>Daily Target (minutes)</Text>
              <TextInput
                style={styles.input}
                value={dailyTarget}
                onChangeText={setDailyTarget}
                placeholder="180"
                placeholderTextColor="#64748B"
                keyboardType="numeric"
              />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Energy Peak</Text>
              <View style={styles.optionRow}>
                {ENERGY_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt}
                    style={[
                      styles.optionChip,
                      energyPeak === opt && styles.optionChipActive,
                    ]}
                    onPress={() => setEnergyPeak(energyPeak === opt ? null : opt)}
                    activeOpacity={0.6}
                  >
                    <Text
                      style={[
                        styles.optionText,
                        energyPeak === opt && styles.optionTextActive,
                      ]}
                    >
                      {opt.charAt(0).toUpperCase() + opt.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionHeader}>Schedule</Text>
            <View style={styles.field}>
              <Text style={styles.label}>Sleep Schedule</Text>
              <View style={styles.timeRow}>
                {renderTimeField("Start", "sleep-start", "22:00", "Sleep start time")}
                {renderTimeField("End", "sleep-end", "06:00", "Sleep end time")}
              </View>
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Preferred Study Window</Text>
              <View style={styles.timeRow}>
                {renderTimeField(
                  "Earliest Start",
                  "study-start",
                  "06:00",
                  "Study window start time",
                )}
                {renderTimeField(
                  "Latest End",
                  "study-end",
                  "22:00",
                  "Study window end time",
                )}
              </View>
            </View>
          </View>

          <TouchableOpacity
            style={styles.saveButtonFull}
            onPress={handleSave}
            activeOpacity={0.8}
            disabled={saveProfile.isPending}
          >
            <Text style={styles.saveButtonText}>
              {saveProfile.isPending ? "Saving..." : "Save Changes"}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0F172A",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  flex: {
    flex: 1,
  },
  scroll: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    color: "#64748B",
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
    marginLeft: 4,
  },
  field: {
    marginBottom: 12,
  },
  label: {
    color: "#94A3B8",
    fontSize: 13,
    fontWeight: "500",
    marginBottom: 6,
    marginLeft: 4,
  },
  input: {
    backgroundColor: "#1E293B",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#334155",
    color: "#F8FAFC",
    fontSize: 16,
    padding: 14,
  },
  optionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  optionChip: {
    backgroundColor: "#1E293B",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#334155",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  optionChipActive: {
    backgroundColor: "rgba(37, 99, 235, 0.15)",
    borderColor: "#2563EB",
  },
  optionText: {
    color: "#94A3B8",
    fontSize: 14,
    fontWeight: "500",
  },
  optionTextActive: {
    color: "#60A5FA",
  },
  timeRow: {
    flexDirection: "row",
    gap: 12,
  },
  timeField: {
    flex: 1,
  },
  timeLabel: {
    color: "#64748B",
    fontSize: 11,
    fontWeight: "500",
    marginBottom: 4,
    marginLeft: 4,
  },
  timeBtn: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#1E293B",
    borderRadius: 12,
    padding: 16,
  },
  timeBtnText: {
    color: "#F8FAFC",
    fontSize: 16,
    fontWeight: "600",
  },
  timeBtnArrow: {
    color: "#64748B",
    fontSize: 16,
  },
  timeInput: {
    backgroundColor: "#1E293B",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#334155",
    color: "#F8FAFC",
    fontSize: 16,
    padding: 14,
  },
  saveButtonFull: {
    backgroundColor: "#2563EB",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginTop: 8,
  },
  saveButtonText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "600",
  },
});
