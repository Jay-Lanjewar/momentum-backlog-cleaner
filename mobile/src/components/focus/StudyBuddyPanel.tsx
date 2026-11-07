import { Fragment, useMemo, useRef, type ReactNode } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import type { ImageStyle, NativeScrollEvent, NativeSyntheticEvent, TextStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Renderer, useMarkdown } from "react-native-marked";

import type { StudyBuddyMessage } from "@/services/types";
import { useTheme } from "@/theme/ThemeProvider";

interface StudyBuddyPanelProps {
  messages: StudyBuddyMessage[];
  draft: string;
  busy: boolean;
  error: string | null;
  countdown: string;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  onRetry: () => void;
  onClose: () => void;
  onSuggestion: (value: string) => void;
}

const SUGGESTIONS = ["Explain this concept", "Give me a hint", "Check my attempt"];

class StudyBuddyRenderer extends Renderer {
  link(children: string | ReactNode[], _href: string, style?: TextStyle): ReactNode {
    return (
      <Text key={this.getKey()} selectable style={style} testID="study-buddy-markdown-link">
        {children}
      </Text>
    );
  }

  image(_uri: string, _alt?: string, _style?: ImageStyle): ReactNode {
    return null;
  }

  linkImage(
    _href: string,
    _imageUrl: string,
    _alt?: string,
    _style?: ImageStyle,
    _title?: string | null,
  ): ReactNode {
    return null;
  }
}

function AssistantMarkdown({ content, colors }: { content: string; colors: ReturnType<typeof useTheme>["colors"] }) {
  const renderer = useMemo(() => new StudyBuddyRenderer({ selectable: true }), []);
  const elements = useMarkdown(content, {
    colorScheme: colors.background === "#F8FAFC" ? "light" : "dark",
    renderer,
    styles: {
      ...markdownStyles,
      text: { ...markdownStyles.text, color: colors.secondaryText },
      strong: { ...markdownStyles.strong, color: colors.primaryText },
      em: { ...markdownStyles.em, color: colors.secondaryText },
      link: { ...markdownStyles.link, color: colors.accentText },
      h1: { ...markdownStyles.h1, color: colors.primaryText },
      h2: { ...markdownStyles.h2, color: colors.primaryText },
      h3: { ...markdownStyles.h3, color: colors.primaryText },
      li: { ...markdownStyles.li, color: colors.secondaryText },
    },
  });

  return (
    <View style={styles.markdown}>
      {elements.map((element, index) => (
        <Fragment key={`markdown-${index}`}>{element}</Fragment>
      ))}
    </View>
  );
}

const markdownStyles = {
  text: { color: "#E2E8F0", fontSize: 15, lineHeight: 23 },
  strong: { color: "#F8FAFC", fontWeight: "700" as const },
  em: { color: "#E2E8F0", fontStyle: "italic" as const },
  paragraph: { marginTop: 0, marginBottom: 12 },
  link: { color: "#93C5FD", textDecorationLine: "underline" as const },
  h1: { color: "#F8FAFC", fontSize: 22, fontWeight: "700" as const, marginBottom: 10 },
  h2: { color: "#F8FAFC", fontSize: 19, fontWeight: "700" as const, marginBottom: 8 },
  h3: { color: "#F8FAFC", fontSize: 16, fontWeight: "700" as const, marginBottom: 6 },
  list: { marginBottom: 12 },
  li: { color: "#E2E8F0", fontSize: 15, lineHeight: 23 },
} satisfies import("react-native-marked").MarkedStyles;

export function StudyBuddyPanel({
  messages,
  draft,
  busy,
  error,
  countdown,
  onDraftChange,
  onSend,
  onRetry,
  onClose,
  onSuggestion,
}: StudyBuddyPanelProps) {
  const { colors } = useTheme();
  const canSend = draft.trim().length > 0 && !busy;
  const messagesRef = useRef<ScrollView>(null);
  const didInitialScrollRef = useRef(false);
  const shouldScrollAfterSendRef = useRef(false);
  const nearBottomRef = useRef(true);

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    nearBottomRef.current =
      contentSize.height - (contentOffset.y + layoutMeasurement.height) < 72;
  };

  const handleContentSizeChange = () => {
    if (!didInitialScrollRef.current) {
      didInitialScrollRef.current = true;
      nearBottomRef.current = true;
      messagesRef.current?.scrollToEnd({ animated: false });
      return;
    }

    if (shouldScrollAfterSendRef.current || nearBottomRef.current) {
      messagesRef.current?.scrollToEnd({ animated: true });
      shouldScrollAfterSendRef.current = false;
    }
  };

  const handleSend = () => {
    if (!canSend) return;
    shouldScrollAfterSendRef.current = true;
    onSend();
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        testID="study-buddy-keyboard-layout"
        style={styles.keyboardAvoiding}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={[styles.screen, { backgroundColor: colors.background }]}>
          <View style={[styles.header, { borderBottomColor: colors.divider }]}>
            <View style={styles.headerIdentity}>
              <View style={styles.brandMark} accessibilityElementsHidden>
                <Text style={[styles.brandMarkText, { color: colors.accentText }]}>✦</Text>
              </View>
              <View style={styles.headerCopy}>
                <Text style={[styles.eyebrow, { color: colors.accentText }]}>MOMENTUM · STUDY SUPPORT</Text>
                <Text style={[styles.title, { color: colors.primaryText }]}>Study Buddy</Text>
              </View>
            </View>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Close Study Buddy"
              onPress={onClose}
              style={[styles.closeButton, { backgroundColor: colors.pressed, borderColor: colors.border }]}
              hitSlop={8}
            >
              <Text style={[styles.closeText, { color: colors.secondaryText }]}>Close</Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.focusStatus, { backgroundColor: colors.accentSoft }]}>
            <View style={styles.focusDot} />
            <Text style={[styles.focusStatusText, { color: colors.secondaryText }]}>Focus session continues ·</Text>
            <Text style={[styles.focusCountdown, { color: colors.primaryText }]}>{countdown}</Text>
          </View>

          <ScrollView
            ref={messagesRef}
            accessibilityLabel="Study Buddy conversation"
            style={styles.messages}
            contentContainerStyle={styles.messagesContent}
            keyboardShouldPersistTaps="handled"
            scrollEventThrottle={16}
            onScroll={handleScroll}
            onContentSizeChange={handleContentSizeChange}
            showsVerticalScrollIndicator
          >
            {messages.length === 0 ? (
              <View style={styles.welcome}>
                <Text style={[styles.welcomeTitle, { color: colors.primaryText }]}>What are you working through?</Text>
                <Text style={[styles.welcomeText, { color: colors.mutedText }]}>
                  Ask a question, share where you got stuck, or get a small hint to keep moving.
                </Text>
                <View style={styles.suggestions}>
                  {SUGGESTIONS.map((suggestion) => (
                    <TouchableOpacity
                      accessibilityRole="button"
                      key={suggestion}
                      onPress={() => onSuggestion(suggestion)}
                      style={[styles.suggestion, { borderColor: colors.border, backgroundColor: colors.pressed }]}
                    >
                      <Text style={[styles.suggestionText, { color: colors.accentText }]}>{suggestion}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ) : (
              messages.map((message, index) => (
                <View
                  key={`${message.role}-${index}`}
                  style={[
                    styles.messageGroup,
                    message.role === "user" ? styles.userMessageGroup : styles.assistantMessageGroup,
                  ]}
                >
                  {message.role === "assistant" ? (
                    <>
                      <Text style={[styles.assistantLabel, { color: colors.mutedText }]}>STUDY BUDDY</Text>
                      <View style={[styles.assistantBubble, { backgroundColor: colors.card, borderColor: colors.border }]}>
                        <AssistantMarkdown content={message.content} colors={colors} />
                      </View>
                    </>
                  ) : (
                    <View style={[styles.userBubble, { backgroundColor: colors.accent }]}>
                      <Text selectable style={[styles.userText, { color: colors.accentForeground }]}>{message.content}</Text>
                    </View>
                  )}
                </View>
              ))
            )}

            {busy && (
              <View accessibilityRole="progressbar" style={styles.loadingRow}>
                <ActivityIndicator size="small" color={colors.accent} />
                <Text style={[styles.loading, { color: colors.mutedText }]}>Study Buddy is thinking…</Text>
              </View>
            )}
            {error && (
              <View style={[styles.errorCard, { backgroundColor: colors.accentSoft, borderColor: colors.error }]}>
                <Text accessibilityRole="alert" style={[styles.errorText, { color: colors.error }]}>{error}</Text>
                <TouchableOpacity
                  accessibilityRole="button"
                  onPress={onRetry}
                  disabled={busy || !draft.trim()}
                  style={styles.retryButton}
                >
                  <Text style={[styles.retryText, { color: colors.error }, (busy || !draft.trim()) && { color: colors.mutedText }]}>
                    Retry
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>

          <View style={[styles.composerShell, { borderTopColor: colors.divider, backgroundColor: colors.surface }]} testID="study-buddy-composer">
            <View style={styles.composer}>
              <TextInput
                testID="study-buddy-input"
                accessibilityLabel="Message Study Buddy"
                value={draft}
                onChangeText={onDraftChange}
                placeholder="Ask a question…"
                placeholderTextColor={colors.placeholder}
                multiline
                maxLength={2000}
                editable={!busy}
                returnKeyType="send"
                submitBehavior="submit"
                textAlignVertical="top"
                scrollEnabled
                onSubmitEditing={handleSend}
                style={[styles.input, { backgroundColor: colors.inputBackground, borderColor: colors.border, color: colors.primaryText }]}
              />
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Send question"
                accessibilityState={{ disabled: !canSend }}
                onPress={handleSend}
                disabled={!canSend}
                style={[styles.sendButton, { backgroundColor: colors.accent }, !canSend && { backgroundColor: colors.pressed }]}
              >
                <Text style={[styles.sendText, { color: canSend ? colors.accentForeground : colors.mutedText }]}>
                  {busy ? "Sending…" : "Send"}
                </Text>
              </TouchableOpacity>
            </View>
            <Text style={[styles.composerHint, { color: colors.mutedText }]}>Study Buddy can make mistakes. Keep your own notes, too.</Text>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#0B1220" },
  keyboardAvoiding: { flex: 1 },
  screen: { flex: 1, backgroundColor: "#0B1220" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#243247",
  },
  headerIdentity: { flexDirection: "row", alignItems: "center", flex: 1, gap: 12 },
  brandMark: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#172B4A",
    borderWidth: 1,
    borderColor: "#27446B",
  },
  brandMarkText: { color: "#93C5FD", fontSize: 23 },
  headerCopy: { flex: 1 },
  eyebrow: { color: "#93C5FD", fontSize: 10, fontWeight: "700", letterSpacing: 1.1 },
  title: { color: "#F8FAFC", fontSize: 18, fontWeight: "700", marginTop: 3 },
  closeButton: {
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: "#172235",
    borderWidth: 1,
    borderColor: "#2D3B50",
    marginLeft: 10,
  },
  closeText: { color: "#D7E5F8", fontSize: 13, fontWeight: "600" },
  focusStatus: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 8,
    marginHorizontal: 20,
    marginTop: 14,
    marginBottom: 4,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: "#10261F",
  },
  focusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#34D399" },
  focusStatusText: { color: "#A7DCC7", fontSize: 10, fontWeight: "700", letterSpacing: 0.55 },
  focusCountdown: { color: "#D1FAE5", fontSize: 11, fontVariant: ["tabular-nums"], fontWeight: "700" },
  messages: { flex: 1, minHeight: 0 },
  messagesContent: { flexGrow: 1, justifyContent: "flex-end", paddingHorizontal: 18, paddingTop: 16, paddingBottom: 20 },
  welcome: { flexGrow: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 12, paddingVertical: 32 },
  welcomeTitle: { color: "#F8FAFC", fontSize: 21, fontWeight: "700", textAlign: "center", marginBottom: 9 },
  welcomeText: { color: "#94A3B8", fontSize: 14, lineHeight: 21, textAlign: "center", maxWidth: 310, marginBottom: 22 },
  suggestions: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 9 },
  suggestion: {
    borderColor: "#334761",
    backgroundColor: "#121F32",
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  suggestionText: { color: "#C8DDF6", fontSize: 12, fontWeight: "500" },
  messageGroup: { width: "100%", marginBottom: 18 },
  userMessageGroup: { alignItems: "flex-end" },
  assistantMessageGroup: { alignItems: "flex-start" },
  assistantLabel: { color: "#8DA7C5", fontSize: 10, fontWeight: "700", letterSpacing: 0.8, marginBottom: 6, marginLeft: 3 },
  assistantBubble: {
    width: "100%",
    borderRadius: 17,
    borderTopLeftRadius: 5,
    backgroundColor: "#142137",
    borderWidth: 1,
    borderColor: "#233751",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  userBubble: {
    maxWidth: "88%",
    borderRadius: 17,
    borderTopRightRadius: 5,
    backgroundColor: "#2458A5",
    paddingHorizontal: 15,
    paddingVertical: 12,
  },
  userText: { color: "#F8FAFC", fontSize: 15, lineHeight: 22 },
  markdown: { width: "100%" },
  loadingRow: { flexDirection: "row", alignItems: "center", gap: 9, paddingVertical: 10, paddingLeft: 3 },
  loading: { color: "#B9D5F5", fontSize: 13 },
  errorCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#321F2A",
    borderColor: "#633443",
    borderWidth: 1,
    borderRadius: 13,
    paddingHorizontal: 13,
    paddingVertical: 10,
    marginTop: 4,
  },
  errorText: { color: "#FECACA", flex: 1, fontSize: 13, lineHeight: 19 },
  retryButton: { padding: 7 },
  retryText: { color: "#FDB4B4", fontSize: 13, fontWeight: "700" },
  disabledText: { color: "#755B63" },
  composerShell: { borderTopWidth: 1, borderTopColor: "#26364B", paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10, backgroundColor: "#0E192A" },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: 10 },
  input: {
    flex: 1,
    maxHeight: 120,
    minHeight: 48,
    backgroundColor: "#111E31",
    borderColor: "#354961",
    borderWidth: 1,
    borderRadius: 15,
    color: "#F8FAFC",
    fontSize: 15,
    lineHeight: 21,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
  },
  sendButton: {
    minWidth: 72,
    height: 48,
    borderRadius: 15,
    backgroundColor: "#3478D4",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  sendButtonDisabled: { backgroundColor: "#26364A" },
  sendText: { color: "#FFF", fontSize: 14, fontWeight: "700" },
  composerHint: { color: "#64748B", fontSize: 10, lineHeight: 14, marginTop: 8, marginLeft: 2 },
});
