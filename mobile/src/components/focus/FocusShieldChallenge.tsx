import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { EMPTY_PROGRESS, selectQuestion, difficultyLabel, masteryFor, masteryKey } from "@/focusShield/adaptive";
import { inferSubject, inferTopic, normalizeBoard, parseGrade, SUBJECT_LABELS, supportedSubjects, topicsFor } from "@/focusShield/curriculum";
import { questionsFor } from "@/focusShield/questions";
import { supportsQuestionVariations } from "@/focusShield/generators";
import { validateAnswer } from "@/focusShield/validation";
import { useBacklogItem } from "@/services/hooks";
import { useFocusShieldStore } from "@/store/useFocusShieldStore";
import { useTheme } from "@/theme/ThemeProvider";
import type { ChallengeQuestion, ChallengeSubject } from "@/focusShield/types";

interface Props {
  visible: boolean;
  onClose: () => void;
  userId: string;
  backlogItemId: string;
  taskTitle: string;
  courseName: string;
  className: string | null;
  boardName: string | null;
}

export function FocusShieldChallenge({ visible, onClose, userId, backlogItemId, taskTitle, courseName, className, boardName }: Props) {
  const { colors } = useTheme();
  const { data: item, isLoading: itemLoading, error: itemError, refetch } = useBacklogItem(visible ? backlogItemId : null);
  const storedUserId = useFocusShieldStore((state) => state.userId);
  const storedProgress = useFocusShieldStore((state) => state.progress);
  const storedStorageError = useFocusShieldStore((state) => state.storageError);
  const progress = storedUserId === userId ? storedProgress : EMPTY_PROGRESS;
  const storageError = storedUserId === userId && storedStorageError;
  const hydrate = useFocusShieldStore((state) => state.hydrate);
  const recordAnswer = useFocusShieldStore((state) => state.recordAnswer);
  const [subjectOverride, setSubjectOverride] = useState<ChallengeSubject | null>(null);
  const [topicOverride, setTopicOverride] = useState<string | null>(null);
  const [screen, setScreen] = useState<"intro" | "question" | "result">("intro");
  const [question, setQuestion] = useState<ChallengeQuestion | null>(null);
  const [answer, setAnswer] = useState<string | string[]>("");
  const [hintUsed, setHintUsed] = useState(false);
  const [revealedHint, setRevealedHint] = useState(false);
  const [result, setResult] = useState<{ correct: boolean; explanation: string } | null>(null);
  const [seen, setSeen] = useState<string[]>([]);
  const [questionCount, setQuestionCount] = useState(0);
  const answerSubmitted = useRef(false);

  const grade = parseGrade(className);
  const board = normalizeBoard(boardName);
  const availableSubjects = supportedSubjects(grade, board);
  const detectedSubject = inferSubject(courseName);
  const subject = subjectOverride ?? (detectedSubject && availableSubjects.includes(detectedSubject) ? detectedSubject : null);
  const subjectTopics = subject ? topicsFor(grade, board, subject) : [];
  const fullTaskText = `${taskTitle} ${item?.title ?? ""} ${item?.description ?? ""}`;
  const detectedTopic = subject ? inferTopic(fullTaskText, subject) : null;
  const selectedTopicId = topicOverride ?? detectedTopic;
  const selectedTopic = subjectTopics.find((topic) => topic.id === selectedTopicId) ?? null;
  const masteryRows = selectedTopic?.skills.map((skill) => ({ skill, mastery: masteryFor(progress, masteryKey(subject!, selectedTopic.id, skill)) })) ?? [];
  const questionMastery = question ? masteryFor(progress, masteryKey(question.subject, question.topic, question.skill)) : null;

  useEffect(() => {
    if (userId) hydrate(userId);
  }, [userId, hydrate]);

  function beginChallenge() {
    if (!selectedTopic || grade === null) return;
    const fresh = useFocusShieldStore.getState().progress;
    const key = (skill: string) => masteryKey(subject!, selectedTopic.id, skill);
    const firstSkill = selectedTopic.skills.filter((skill) => questionsFor(selectedTopic.id, grade, board ?? "").some((entry) => entry.skill === skill && !seen.includes(entry.id)) || supportsQuestionVariations(selectedTopic.id, skill, grade, board ?? "")).sort((a, b) => (fresh.skills[key(a)]?.attempts ?? 0) - (fresh.skills[key(b)]?.attempts ?? 0))[0];
    if (!firstSkill) { setScreen("intro"); setSeen([]); setQuestionCount(0); return; }
    const level = fresh.skills[key(firstSkill)]?.difficulty ?? 1;
    const next = selectQuestion(selectedTopic.id, grade, board ?? "", level, seen, firstSkill, fresh.recentQuestionIds);
    if (!next) return;
    answerSubmitted.current = false;
    setQuestion(next); setSeen((ids) => [...ids, next.id]); setAnswer(""); setHintUsed(false); setRevealedHint(false); setResult(null); setScreen("question");
  }

  function submitAnswer() {
    if (!question || !answerIsPresent || !userId || screen !== "question" || answerSubmitted.current) return;
    answerSubmitted.current = true;
    const checked = validateAnswer(question, answer);
    recordAnswer(userId, question.subject, question.topic, question.skill, question.id, checked.correct, hintUsed);
    setResult({ correct: checked.correct, explanation: question.explanation });
    setQuestionCount((count) => count + 1);
    setScreen("result");
  }

  const unavailable = grade === null || availableSubjects.length === 0 || (subject !== null && !subjectTopics.length);
  const subjectLabel = subject ? SUBJECT_LABELS[subject] : "a subject";
  const answerIsPresent = Array.isArray(answer) ? answer.length > 0 : answer.trim().length > 0;
  const choices = question?.choices ?? (question?.answerType === "true-false" ? ["True", "False"] : undefined);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaView testID="focus-shield-root" style={[styles.container, { backgroundColor: colors.background }]} edges={["top", "bottom"]}>
        <View style={styles.topbar}>
          <Text style={[styles.brand, { color: colors.accentText }]}>MOMENTUM · FOCUS SHIELD</Text>
          <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Close challenge" style={styles.closeButton}>
            <Text style={[styles.closeText, { color: colors.secondaryText }]}>Close</Text>
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {itemLoading ? <View style={styles.loading}><ActivityIndicator color={colors.accent} /><Text style={[styles.meta, { color: colors.mutedText }]}>Checking for extra task details. You can continue with the study context above.</Text></View> : null}
          {itemError ? <View style={[styles.notice, { backgroundColor: colors.accentSoft }]}><Text style={[styles.body, { color: colors.secondaryText }]}>Task details are temporarily unavailable. You can retry and choose the topic yourself.</Text><ActionButton label="Retry" onPress={() => void refetch()} colors={colors} /></View> : null}
          {screen === "intro" && (
            <>
              <View style={[styles.hero, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.kicker, { color: colors.accentText }]}>A quick practice break</Text>
                <Text style={[styles.title, { color: colors.primaryText }]}>Focus Shield</Text>
                <Text style={[styles.body, { color: colors.secondaryText }]}>Try a few original questions connected to the work you’re doing. Your answers stay on this device and help choose a comfortable next level.</Text>
                <Text style={[styles.disclaimer, { color: colors.mutedText }]}>This preview does not block or monitor other apps.</Text>
              </View>
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.sectionTitle, { color: colors.primaryText }]}>Your study context</Text>
                <Text style={[styles.context, { color: colors.secondaryText }]}>{taskTitle || item?.title || "Current Focus task"}</Text>
                <Text style={[styles.meta, { color: colors.mutedText }]}>{courseName || "Course not identified"}  ·  {className || "Class not set"}  ·  {boardName || "Board not set"}</Text>
                {itemError ? null : null}
              </View>
              {unavailable ? (
                <View style={[styles.notice, { backgroundColor: colors.pressed }]}>
                  <Text style={[styles.sectionTitle, { color: colors.primaryText }]}>This curriculum isn’t available yet</Text>
                  <Text style={[styles.body, { color: colors.secondaryText }]}>There are no validated questions for {className || "this class"} and {boardName || "this board"} in the current offline catalog. Your Focus session is unaffected.</Text>
                </View>
              ) : (
                <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={[styles.sectionTitle, { color: colors.primaryText }]}>Confirm the topic</Text>
                  <Text style={[styles.meta, { color: colors.mutedText }]}>We use the course and task title as a suggestion. Confirm the subject and choose the topic you’re studying.</Text>
                  {selectedTopic?.board === "general" ? <Text style={[styles.meta, { color: colors.warning }]}>Board-neutral foundation practice. This question is not tagged to a board syllabus.</Text> : null}
                  {selectedTopic?.board === "CBSE" ? <Text style={[styles.meta, { color: colors.mutedText }]}>CBSE Class 9 Science topic subset.</Text> : null}
                  <View style={styles.chips}>
                    {availableSubjects.map((value) => <ChoiceChip key={value} label={SUBJECT_LABELS[value]} selected={subject === value} onPress={() => { setSubjectOverride(value); setTopicOverride(null); setSeen([]); setQuestionCount(0); }} colors={colors} />)}
                  </View>
                  {detectedSubject && !availableSubjects.includes(detectedSubject) ? <Text style={[styles.meta, { color: colors.warning }]}>No validated {SUBJECT_LABELS[detectedSubject]} questions are available for this class and board. Choose another subject only if it matches this study task.</Text> : null}
                  {detectedSubject && detectedSubject === subject ? <Text style={[styles.meta, { color: colors.accentText }]}>Suggested from course: {subjectLabel}. Please confirm.</Text> : null}
                  <View style={styles.chips}>
                    {subjectTopics.map((value) => <ChoiceChip key={value.id} label={value.label} selected={selectedTopicId === value.id} onPress={() => { setTopicOverride(value.id); setSeen([]); setQuestionCount(0); }} colors={colors} />)}
                  </View>
                  {detectedTopic && detectedTopic === selectedTopicId ? <Text style={[styles.meta, { color: colors.accentText }]}>Suggested from your task. Confirm before continuing.</Text> : null}
                </View>
              )}
              {selectedTopic ? (
                <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={[styles.sectionTitle, { color: colors.primaryText }]}>Skill snapshot</Text>
                  {masteryRows.map(({ skill, mastery }) => <View key={skill} style={styles.masteryRow}><Text style={[styles.body, { color: colors.secondaryText }]}>{skill.replaceAll("-", " ")}</Text><Text style={[styles.meta, { color: colors.mutedText }]}>{mastery ? `${mastery.mastery}% · ${mastery.attempts} tries · ${mastery.confidence}% confidence` : "Starting point · confidence builds with practice"}</Text></View>)}
                  {storageError ? <Text style={[styles.meta, { color: colors.warning }]}>Local progress could not be saved. You can keep practicing; try again when device storage is available.</Text> : null}
                </View>
              ) : null}
              <ActionButton label={questionCount >= 3 ? "Start another 3-question check-in" : "Confirm topic and begin check-in"} disabled={!selectedTopic || unavailable} onPress={beginChallenge} colors={colors} />
              <Text style={[styles.meta, styles.center, { color: colors.mutedText }]}>A short check-in builds your starting skill profile. No timer and no penalty for mistakes.</Text>
            </>
          )}
          {screen === "question" && question && (
            <>
              <View style={[styles.progressTrack, { backgroundColor: colors.border }]}><View style={[styles.progressFill, { backgroundColor: colors.accent, width: `${Math.min(100, ((questionCount + 1) / 3) * 100)}%` }]} /></View>
              <Text style={[styles.meta, { color: colors.mutedText }]}>{questionCount < 3 && !questionMastery?.attempts ? `Check-in · ${questionCount + 1} of 3` : `${selectedTopic?.label} · ${difficultyLabel(question.difficulty)}`}</Text>
              {question.requestedDifficulty !== undefined && question.requestedDifficulty !== question.difficulty ? <Text style={[styles.meta, { color: colors.warning }]}>Your next target is {difficultyLabel(question.requestedDifficulty)}, but the available question is {difficultyLabel(question.difficulty)}. This answer won’t count as a higher-difficulty challenge.</Text> : null}
              <View style={[styles.questionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.kicker, { color: colors.accentText }]}>{question.skill.replaceAll("-", " ")}</Text>
                <Text accessibilityRole="header" style={[styles.question, { color: colors.primaryText }]}>{question.prompt}</Text>
                {choices?.map((choice) => {
                  const selected = Array.isArray(answer) ? answer.includes(choice) : answer === choice;
                  return <TouchableOpacity key={choice} accessibilityRole={question.answerType === "multiple-choice" ? "checkbox" : "radio"} accessibilityState={{ checked: selected }} onPress={() => setAnswer((current) => question.answerType === "multiple-choice" ? (Array.isArray(current) ? current.includes(choice) ? current.filter((entry) => entry !== choice) : [...current, choice] : [choice]) : choice)} style={[styles.choice, { borderColor: selected ? colors.accent : colors.border, backgroundColor: selected ? colors.accentSoft : colors.surface }]}><Text style={[styles.choiceText, { color: colors.primaryText }]}>{choice}</Text></TouchableOpacity>;
                })}
                {!choices ? <TextInput value={Array.isArray(answer) ? answer.join(", ") : answer} onChangeText={setAnswer} placeholder="Type your answer" placeholderTextColor={colors.placeholder} accessibilityLabel="Your answer" style={[styles.answerInput, { backgroundColor: colors.inputBackground, borderColor: colors.border, color: colors.primaryText }]} /> : null}
                {revealedHint && question.hint ? <Text style={[styles.hintText, { color: colors.secondaryText }]}>{question.hint}</Text> : null}
                {question.hint && !revealedHint ? <TouchableOpacity accessibilityRole="button" onPress={() => { setHintUsed(true); setRevealedHint(true); }} style={styles.hintButton}><Text style={[styles.actionLink, { color: colors.accentText }]}>Show a hint</Text></TouchableOpacity> : null}
              </View>
              <ActionButton label="Check answer" disabled={!answerIsPresent} onPress={submitAnswer} colors={colors} />
            </>
          )}
          {screen === "result" && question && result && (
            <>
              <View style={[styles.feedback, { backgroundColor: result.correct ? colors.accentSoft : colors.pressed, borderColor: colors.border }]}>
                <Text style={[styles.sectionTitle, { color: result.correct ? colors.success : colors.primaryText }]}>{result.correct ? "That’s right" : "Good practice"}</Text>
                {!result.correct ? <Text style={[styles.body, { color: colors.secondaryText }]}>The answer is {String(question.correctAnswer)}. Every attempt helps us find a useful level.</Text> : null}
                <Text style={[styles.body, { color: colors.secondaryText }]}>{result.explanation}</Text>
                {questionCount >= 3 ? <Text style={[styles.meta, { color: colors.mutedText }]}>Starting profile: {questionMastery?.mastery ?? 0}% mastery · {questionMastery?.confidence ?? 0}% confidence for this skill.</Text> : null}
              </View>
              {questionCount < 3 ? <ActionButton label="Next question" onPress={beginChallenge} colors={colors} /> : <ActionButton label="Finish check-in" onPress={() => { setScreen("intro"); setSeen([]); }} colors={colors} />}
              <TouchableOpacity accessibilityRole="button" onPress={() => setScreen("intro")} style={styles.secondaryAction}><Text style={[styles.actionLink, { color: colors.accentText }]}>Review topic and skills</Text></TouchableOpacity>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function ChoiceChip({ label, selected, onPress, colors }: { label: string; selected: boolean; onPress: () => void; colors: ReturnType<typeof useTheme>["colors"] }) {
  return <TouchableOpacity accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={[styles.chip, { borderColor: selected ? colors.accent : colors.border, backgroundColor: selected ? colors.accentSoft : colors.surface }]}><Text style={[styles.chipText, { color: selected ? colors.accentSoftForeground : colors.secondaryText }]}>{label}</Text></TouchableOpacity>;
}

function ActionButton({ label, onPress, disabled, colors }: { label: string; onPress: () => void; disabled?: boolean; colors: ReturnType<typeof useTheme>["colors"] }) {
  return <TouchableOpacity accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.primaryButton, { backgroundColor: disabled ? colors.pressed : colors.accent }]}><Text style={[styles.primaryButtonText, { color: disabled ? colors.mutedText : colors.accentForeground }]}>{label}</Text></TouchableOpacity>;
}

const styles = StyleSheet.create({
  container: { flex: 1 }, topbar: { minHeight: 54, paddingHorizontal: 20, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  brand: { fontSize: 11, fontWeight: "800", letterSpacing: 1 }, closeButton: { padding: 10 }, closeText: { fontSize: 14, fontWeight: "600" },
  content: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 32, gap: 14 }, hero: { borderWidth: 1, borderRadius: 22, padding: 20, gap: 10 },
  kicker: { fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.7 }, title: { fontSize: 30, fontWeight: "800", letterSpacing: -0.6 },
  body: { fontSize: 15, lineHeight: 22 }, disclaimer: { fontSize: 12, lineHeight: 18, marginTop: 2 }, card: { borderWidth: 1, borderRadius: 18, padding: 16, gap: 12 },
  sectionTitle: { fontSize: 17, lineHeight: 23, fontWeight: "700" }, context: { fontSize: 16, lineHeight: 23, fontWeight: "600" }, meta: { fontSize: 12, lineHeight: 18 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 9 }, chipText: { fontSize: 13, fontWeight: "600" },
  notice: { borderRadius: 16, padding: 16, gap: 12 }, masteryRow: { gap: 2 }, primaryButton: { minHeight: 52, justifyContent: "center", alignItems: "center", borderRadius: 14, paddingHorizontal: 18 },
  primaryButtonText: { fontSize: 15, fontWeight: "700" }, center: { textAlign: "center" }, loading: { minHeight: 160, alignItems: "center", justifyContent: "center", gap: 12 },
  progressTrack: { height: 5, borderRadius: 99, overflow: "hidden" }, progressFill: { height: "100%", borderRadius: 99 }, questionCard: { borderWidth: 1, borderRadius: 20, padding: 18, gap: 14, marginTop: 12 },
  question: { fontSize: 21, lineHeight: 29, fontWeight: "700" }, choice: { minHeight: 48, padding: 12, justifyContent: "center", borderWidth: 1, borderRadius: 12 }, choiceText: { fontSize: 15, lineHeight: 21 },
  answerInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, minHeight: 50, fontSize: 17 }, hintButton: { paddingVertical: 6, alignSelf: "flex-start" }, hintText: { fontSize: 14, lineHeight: 21 }, actionLink: { fontSize: 14, fontWeight: "700" },
  feedback: { borderWidth: 1, borderRadius: 18, padding: 18, gap: 12 }, secondaryAction: { alignItems: "center", padding: 12 },
});
