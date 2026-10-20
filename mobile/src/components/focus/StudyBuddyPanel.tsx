import { Fragment, useMemo, useRef, type ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import type { ImageStyle, TextStyle } from "react-native";
import { Renderer, useMarkdown } from "react-native-marked";

import type { StudyBuddyMessage } from "@/services/types";

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
    return <Text key={this.getKey()} style={style}>{children}</Text>;
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

function AssistantMarkdown({ content }: { content: string }) {
  const renderer = useMemo(() => new StudyBuddyRenderer({ selectable: true }), []);
  const elements = useMarkdown(content, {
    colorScheme: "dark",
    renderer,
    styles: markdownStyles,
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
  text: { color: "#F8FAFC", fontSize: 13, lineHeight: 19 },
  strong: { color: "#F8FAFC", fontWeight: "700" as const },
  em: { color: "#E2E8F0", fontStyle: "italic" as const },
  paragraph: { marginTop: 0, marginBottom: 8 },
  link: { color: "#93C5FD", textDecorationLine: "underline" as const },
  h1: { color: "#F8FAFC", fontSize: 18, fontWeight: "700" as const, marginBottom: 8 },
  h2: { color: "#F8FAFC", fontSize: 16, fontWeight: "700" as const, marginBottom: 6 },
  h3: { color: "#F8FAFC", fontSize: 14, fontWeight: "700" as const, marginBottom: 4 },
  list: { marginBottom: 8 },
  li: { color: "#F8FAFC", fontSize: 13, lineHeight: 19 },
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
  const canSend = draft.trim().length > 0 && !busy;

  const messagesRef = useRef<ScrollView>(null);
  const scrollToLatest = () => messagesRef.current?.scrollToEnd({ animated: true });

  return (
    <KeyboardAvoidingView
      style={styles.keyboardAvoiding}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
    <View style={styles.panel}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Study Buddy</Text>
          <Text style={styles.subtitle}>Your Focus session continues · {countdown}</Text>
        </View>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Close Study Buddy"
          onPress={onClose}
          style={styles.closeButton}
        >
          <Text style={styles.closeText}>Close</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        ref={messagesRef}
        accessibilityLabel="Study Buddy conversation"
        style={styles.messages}
        contentContainerStyle={styles.messagesContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator
        onContentSizeChange={scrollToLatest}
      >
        {messages.length === 0 ? (
          <View style={styles.welcome}>
            <Text style={styles.welcomeText}>What are you working through?</Text>
            <View style={styles.suggestions}>
              {SUGGESTIONS.map((suggestion) => (
                <TouchableOpacity
                  accessibilityRole="button"
                  key={suggestion}
                  onPress={() => onSuggestion(suggestion)}
                  style={styles.suggestion}
                >
                  <Text style={styles.suggestionText}>{suggestion}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : (
          messages.map((message, index) => (
            <View
              key={`${message.role}-${index}`}
              style={[
                styles.bubble,
                message.role === "user" ? styles.userBubble : styles.tutorBubble,
              ]}
            >
              {message.role === "assistant" ? (
                <AssistantMarkdown content={message.content} />
              ) : (
                <Text style={styles.bubbleText}>{message.content}</Text>
              )}
            </View>
          ))
        )}
        {busy && (
          <Text accessibilityRole="text" style={styles.loading}>
            Study Buddy is thinking…
          </Text>
        )}
        {error && (
          <View style={styles.errorRow}>
            <Text accessibilityRole="alert" style={styles.errorText}>{error}</Text>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={onRetry}
              disabled={busy || !draft.trim()}
              style={styles.retryButton}
            >
              <Text style={[styles.retryText, (busy || !draft.trim()) && styles.disabledText]}>
                Retry
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      <View style={styles.composer}>
        <TextInput
          accessibilityLabel="Message Study Buddy"
          value={draft}
          onChangeText={onDraftChange}
          placeholder="Ask a question…"
          placeholderTextColor="#64748B"
          multiline
          maxLength={2000}
          editable={!busy}
          returnKeyType="send"
          blurOnSubmit
          onSubmitEditing={onSend}
          style={styles.input}
        />
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Send question"
          onPress={onSend}
          disabled={!canSend}
          style={[styles.sendButton, !canSend && styles.sendButtonDisabled]}
        >
          <Text style={styles.sendText}>{busy ? "Sending…" : "Send"}</Text>
        </TouchableOpacity>
      </View>
    </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardAvoiding: { flex: 1, width: "100%" },
  panel: {
    flex: 1,
    minHeight: 0,
    width: "100%",
    backgroundColor: "#111D31",
    borderTopWidth: 1,
    borderColor: "#26364F",
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  headerCopy: { flex: 1 },
  title: { color: "#F8FAFC", fontSize: 16, fontWeight: "700" },
  subtitle: { color: "#94A3B8", fontSize: 11, marginTop: 2 },
  closeButton: { paddingHorizontal: 12, paddingVertical: 8 },
  closeText: { color: "#93C5FD", fontSize: 13, fontWeight: "600" },
  messages: { flex: 1, minHeight: 60 },
  messagesContent: { flexGrow: 1, justifyContent: "flex-end", gap: 8, paddingBottom: 8 },
  welcome: { flex: 1, justifyContent: "center", gap: 12 },
  welcomeText: { color: "#CBD5E1", fontSize: 14, textAlign: "center" },
  suggestions: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 7 },
  suggestion: {
    borderColor: "#334155",
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  suggestionText: { color: "#BFDBFE", fontSize: 11 },
  bubble: { maxWidth: "90%", borderRadius: 14, paddingHorizontal: 12, paddingVertical: 9 },
  userBubble: { alignSelf: "flex-end", backgroundColor: "#1D4ED8" },
  tutorBubble: { alignSelf: "flex-start", backgroundColor: "#1E293B" },
  bubbleText: { color: "#F8FAFC", fontSize: 13, lineHeight: 19 },
  markdown: { width: "100%" },
  loading: { color: "#93C5FD", fontSize: 12, paddingVertical: 6 },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    backgroundColor: "#3B1F2A",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  errorText: { color: "#FECACA", fontSize: 11, flex: 1, lineHeight: 15 },
  retryButton: { padding: 6 },
  retryText: { color: "#FCA5A5", fontSize: 12, fontWeight: "700" },
  disabledText: { color: "#64748B" },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: 8, paddingTop: 6 },
  input: {
    flex: 1,
    maxHeight: 72,
    minHeight: 42,
    backgroundColor: "#0F172A",
    borderColor: "#334155",
    borderWidth: 1,
    borderRadius: 12,
    color: "#F8FAFC",
    fontSize: 13,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  sendButton: {
    minWidth: 62,
    height: 42,
    borderRadius: 12,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  sendButtonDisabled: { backgroundColor: "#334155" },
  sendText: { color: "#FFF", fontSize: 13, fontWeight: "700" },
});
