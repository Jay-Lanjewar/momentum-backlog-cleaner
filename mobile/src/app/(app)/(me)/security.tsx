import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { SvgXml } from "react-native-svg";

import { MeHeader } from "@/components/MeHeader";
import { supabase } from "@/lib/supabase";
import {
  formatSecret,
  friendlyMfaError,
  isValidTotpCode,
  pickUnverifiedTotpFactor,
  pickVerifiedTotpFactor,
  qrSvgFromDataUri,
} from "@/lib/mfa";
import type { FactorList, TotpFactor } from "@/lib/mfa";

const QR_SIZE = 176;

/**
 * loading → checking factor status with Supabase.
 * off     → no factors; nothing to protect the account yet.
 * setup   → enroll() succeeded this session; QR shown, manual key hidden
 *           behind an explicit reveal.
 * pending → an unverified factor was left behind by an interrupted setup.
 * on      → a verified TOTP factor exists.
 */
type Phase = "loading" | "off" | "setup" | "pending" | "on";

type EnrollDraft = {
  factorId: string;
  qrCode: string;
  secret: string;
};

export default function SecurityScreen() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [verified, setVerified] = useState<TotpFactor | null>(null);
  const [draft, setDraft] = useState<EnrollDraft | null>(null);
  const [pendingFactorId, setPendingFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [codeFocused, setCodeFocused] = useState(false);

  const applyFactors = useCallback(
    (data: FactorList | null, loadError: unknown) => {
      if (loadError || !data) {
        // Status unknown: land on Off with friendly copy instead of a spinner.
        setError(friendlyMfaError(loadError));
        setPhase((current) => (current === "loading" ? "off" : current));
        return;
      }

      const verifiedFactor = pickVerifiedTotpFactor(data);
      const unverifiedFactor = pickUnverifiedTotpFactor(data);
      setVerified(verifiedFactor);
      setPendingFactorId(unverifiedFactor?.id ?? null);
      setDraft(null);
      setShowKey(false);
      setPhase(verifiedFactor ? "on" : unverifiedFactor ? "pending" : "off");
    },
    [],
  );

  const reload = useCallback(async () => {
    const { data, error } = await supabase.auth.mfa.listFactors();
    applyFactors(data, error);
  }, [applyFactors]);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.mfa
      .listFactors()
      .then(({ data, error }) => {
        if (cancelled) return;
        applyFactors(data, error);
      })
      .catch((loadError) => {
        if (cancelled) return;
        applyFactors(null, loadError);
      });
    return () => {
      cancelled = true;
    };
  }, [applyFactors]);

  async function handleEnable() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "Momentum",
      });
      if (enrollError || !data || !("totp" in data) || !data.totp) {
        setError(friendlyMfaError(enrollError));
        return;
      }
      // enroll() creates an UNVERIFIED factor — 2-step stays off until verify.
      setDraft({
        factorId: data.id,
        qrCode: data.totp.qr_code ?? "",
        secret: data.totp.secret ?? "",
      });
      setPendingFactorId(null);
      setCode("");
      setShowKey(false);
      setPhase("setup");
    } catch (enrollError) {
      setError(friendlyMfaError(enrollError));
    } finally {
      setBusy(false);
    }
  }

  async function handleVerify() {
    const factorId = draft?.factorId ?? pendingFactorId;
    const trimmed = code.trim();
    if (!factorId || busy) return;
    if (!isValidTotpCode(trimmed)) {
      setError("Enter the 6-digit code from your authenticator app.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      // Fresh challenge per attempt so an expired one can never block a retry.
      const challenge = await supabase.auth.mfa.challenge({ factorId });
      if (challenge.error || !challenge.data) {
        setError(friendlyMfaError(challenge.error));
        return;
      }

      const verify = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.data.id,
        code: trimmed,
      });
      if (verify.error || !verify.data) {
        setError(friendlyMfaError(verify.error));
        setCode("");
        return;
      }

      setCode("");
      await reload();
    } catch (verifyError) {
      setError(friendlyMfaError(verifyError));
    } finally {
      setBusy(false);
    }
  }

  async function handleDiscard(factorId: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const { error: unenrollError } = await supabase.auth.mfa.unenroll({
        factorId,
      });
      if (unenrollError) {
        setError(friendlyMfaError(unenrollError));
        return;
      }
      setDraft(null);
      setPendingFactorId(null);
      setCode("");
      setShowKey(false);
      setVerified(null);
      setPhase("off");
    } catch (discardError) {
      setError(friendlyMfaError(discardError));
    } finally {
      setBusy(false);
    }
  }

  function handleDisablePress() {
    if (!verified || busy) return;
    Alert.alert(
      "Disable 2-step authentication?",
      "You'll only need your password to sign in. You can turn 2-step authentication on again any time.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Disable",
          style: "destructive",
          onPress: () => void handleDisable(verified.id),
        },
      ],
    );
  }

  async function handleDisable(factorId: string) {
    setBusy(true);
    setError(null);
    try {
      const { error: unenrollError } = await supabase.auth.mfa.unenroll({
        factorId,
      });
      if (unenrollError) {
        setError(friendlyMfaError(unenrollError));
        return;
      }
      // The stored JWT still claims aal2 until the session is refreshed.
      await supabase.auth.refreshSession();
      setVerified(null);
      setDraft(null);
      setPendingFactorId(null);
      setCode("");
      setShowKey(false);
      setPhase("off");
    } catch (disableError) {
      setError(friendlyMfaError(disableError));
    } finally {
      setBusy(false);
    }
  }

  const qrXml = draft ? qrSvgFromDataUri(draft.qrCode) : "";
  const canVerify = isValidTotpCode(code) && !busy;

  function renderError(inline: boolean) {
    if (!error) return null;
    return (
      <View
        style={[styles.errorBox, inline && styles.errorBoxInline]}
        testID="security-error"
      >
        <Text style={styles.errorText}>{error}</Text>
        {phase === "off" ? (
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => {
              setError(null);
              void reload();
            }}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Try again"
            testID="security-retry"
          >
            <Text style={styles.retryText}>Try again</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }

  function renderCodeInput(withLabel: boolean) {
    return (
      <>
        {withLabel ? <Text style={styles.label}>6-digit code</Text> : null}
        <TextInput
          style={[styles.codeInput, codeFocused && styles.codeInputFocused]}
          value={code}
          onChangeText={setCode}
          onFocus={() => setCodeFocused(true)}
          onBlur={() => setCodeFocused(false)}
          placeholder="123456"
          placeholderTextColor="#64748B"
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          maxLength={6}
          editable={!busy}
          accessibilityLabel="6-digit code from your authenticator app"
          testID="security-code-input"
        />
      </>
    );
  }

  const verifyButton = (
    <TouchableOpacity
      style={[styles.primaryButton, !canVerify && styles.buttonDisabled]}
      onPress={() => void handleVerify()}
      disabled={!canVerify}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel="Verify and turn on"
      testID="security-verify"
    >
      {busy ? (
        <ActivityIndicator color="#FFF" size="small" />
      ) : (
        <Text style={styles.primaryButtonText}>Verify and turn on</Text>
      )}
    </TouchableOpacity>
  );

  const stepHeader = (number: string, title: string) => (
    <View style={styles.stepRow}>
      <View
        style={styles.stepBadge}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Text style={styles.stepBadgeText}>{number}</Text>
      </View>
      <Text style={styles.stepTitle}>{title}</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <MeHeader screen="security" title="Security" />

        {phase === "loading" || phase === "off" ? renderError(false) : null}

        {phase === "loading" ? (
          <View style={styles.loadingBox} testID="security-loading">
            <ActivityIndicator color="#2563EB" size="small" />
            <Text style={styles.loadingText}>Checking your settings…</Text>
          </View>
        ) : null}

        {phase === "off" ? (
          <>
            <Text style={styles.hero}>Keep your account secure</Text>
            <View style={styles.card}>
              <View style={styles.statusRow}>
                <Text style={styles.cardTitle}>2-step authentication</Text>
                <View style={[styles.chip, styles.chipOff]}>
                  <Text style={styles.chipOffText} testID="security-status">
                    Off
                  </Text>
                </View>
              </View>
              <Text style={styles.body}>
                Add a second step when you sign in. After your password,
                you&apos;ll enter a 6-digit code that your authenticator app
                (like Google Authenticator or 1Password) generates for Momentum.
              </Text>
              <TouchableOpacity
                style={[styles.primaryButton, busy && styles.buttonDisabled]}
                onPress={() => void handleEnable()}
                disabled={busy}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Enable 2-step authentication"
                testID="security-enable"
              >
                {busy ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <Text style={styles.primaryButtonText}>
                    Enable 2-step authentication
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </>
        ) : null}

        {phase === "setup" && draft ? (
          <View style={styles.card}>
            <Text style={[styles.cardTitle, styles.titleBlock]}>
              Set up 2-step authentication
            </Text>

            {stepHeader("1", "Scan with your authenticator app")}
            <Text style={[styles.body, styles.bodySpaced]}>
              Open your authenticator app, add a new account, and scan this code
              for Momentum.
            </Text>
            <View style={styles.qrWrap} testID="security-qr">
              {qrXml ? (
                <SvgXml
                  xml={qrXml}
                  width={QR_SIZE}
                  height={QR_SIZE}
                  accessibilityLabel="Momentum setup QR code"
                />
              ) : null}
            </View>

            <View style={styles.revealBlock}>
              <Text style={styles.label}>Can&apos;t scan the code?</Text>
              {!showKey ? (
                <TouchableOpacity
                  style={styles.ghostButton}
                  onPress={() => setShowKey(true)}
                  disabled={busy}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Show setup key"
                  accessibilityHint="Displays the manual setup key for your authenticator app"
                  testID="security-show-key"
                >
                  <Text style={styles.ghostButtonText}>Show setup key</Text>
                </TouchableOpacity>
              ) : (
                <>
                  <Text style={styles.secretText} testID="security-secret">
                    {formatSecret(draft.secret)}
                  </Text>
                  <Text style={styles.warningText}>
                    Keep this key private. Anyone with this key can generate
                    codes for your Momentum account.
                  </Text>
                  <TouchableOpacity
                    style={styles.ghostButton}
                    onPress={() => setShowKey(false)}
                    disabled={busy}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel="Hide setup key"
                    testID="security-hide-key"
                  >
                    <Text style={styles.ghostButtonText}>Hide setup key</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>

            {stepHeader("2", "Enter the 6-digit code")}
            {renderCodeInput(false)}
            {renderError(true)}
            {verifyButton}
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => void handleDiscard(draft.factorId)}
              disabled={busy}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Cancel setup"
              testID="security-cancel"
            >
              <Text style={styles.secondaryButtonText}>Cancel setup</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {phase === "pending" && pendingFactorId ? (
          <View style={styles.card}>
            <View style={styles.statusRow}>
              <Text style={styles.cardTitle}>Setup in progress</Text>
              <View style={[styles.chip, styles.chipPending]}>
                <Text style={styles.chipPendingText}>Not finished</Text>
              </View>
            </View>
            <Text style={styles.body}>
              You started adding 2-step authentication. If you already added
              Momentum to your authenticator app, enter the 6-digit code to
              finish. Otherwise, discard this setup to start fresh.
            </Text>
            {renderCodeInput(true)}
            {renderError(true)}
            {verifyButton}
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => void handleDiscard(pendingFactorId)}
              disabled={busy}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Discard unfinished setup"
              testID="security-discard"
            >
              <Text style={styles.secondaryButtonText}>Discard setup</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {phase === "on" && verified ? (
          <View style={styles.card}>
            <View style={styles.onHeadingRow}>
              <View
                style={styles.checkCircle}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              >
                <Text style={styles.checkText}>{"\u2713"}</Text>
              </View>
              <Text style={styles.cardTitle}>
                2-step authentication is on
              </Text>
            </View>
            <Text style={styles.body}>
              Momentum asks for a 6-digit code from your authenticator app after
              your password at sign-in.
            </Text>
            <View style={styles.factorRow} testID="security-factor">
              <View style={styles.factorDot} />
              <Text style={styles.factorName} numberOfLines={1}>
                {verified.friendly_name || "Authenticator app"}
              </Text>
              <Text style={styles.factorMeta}>Verified</Text>
            </View>
            {renderError(true)}
            <TouchableOpacity
              style={[styles.dangerButton, busy && styles.buttonDisabled]}
              onPress={handleDisablePress}
              disabled={busy}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Disable 2-step authentication"
              testID="security-disable"
            >
              {busy ? (
                <ActivityIndicator color="#EF4444" size="small" />
              ) : (
                <Text style={styles.dangerText}>
                  Disable 2-step authentication
                </Text>
              )}
            </TouchableOpacity>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0F172A",
  },
  scroll: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  loadingBox: {
    alignItems: "center",
    paddingVertical: 48,
    gap: 12,
  },
  loadingText: {
    color: "#94A3B8",
    fontSize: 14,
  },
  hero: {
    color: "#F8FAFC",
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 16,
  },
  card: {
    backgroundColor: "#1E293B",
    borderRadius: 14,
    padding: 16,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 8,
  },
  cardTitle: {
    color: "#F8FAFC",
    fontSize: 17,
    fontWeight: "700",
    flexShrink: 1,
  },
  titleBlock: {
    marginBottom: 14,
  },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  chipOff: {
    backgroundColor: "rgba(148, 163, 184, 0.15)",
  },
  chipOffText: {
    color: "#94A3B8",
    fontSize: 12,
    fontWeight: "700",
  },
  chipPending: {
    backgroundColor: "rgba(245, 158, 11, 0.15)",
  },
  chipPendingText: {
    color: "#F59E0B",
    fontSize: 12,
    fontWeight: "700",
  },
  body: {
    color: "#94A3B8",
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 16,
  },
  bodySpaced: {
    marginBottom: 14,
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  stepBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
  },
  stepBadgeText: {
    color: "#FFF",
    fontSize: 13,
    fontWeight: "700",
  },
  stepTitle: {
    color: "#F8FAFC",
    fontSize: 15,
    fontWeight: "600",
    flexShrink: 1,
  },
  qrWrap: {
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFF",
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 18,
  },
  revealBlock: {
    marginBottom: 18,
  },
  label: {
    color: "#F8FAFC",
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 6,
  },
  ghostButton: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#334155",
    backgroundColor: "rgba(37, 99, 235, 0.1)",
  },
  ghostButtonText: {
    color: "#60A5FA",
    fontSize: 15,
    fontWeight: "600",
  },
  secretText: {
    color: "#F8FAFC",
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: 2,
    backgroundColor: "#0F172A",
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#334155",
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 8,
    textAlign: "center",
  },
  warningText: {
    color: "#F59E0B",
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 10,
  },
  codeInput: {
    backgroundColor: "#0F172A",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 24,
    fontWeight: "700",
    letterSpacing: 10,
    color: "#F8FAFC",
    textAlign: "center",
    marginBottom: 14,
  },
  codeInputFocused: {
    borderColor: "#2563EB",
    backgroundColor: "#0B1220",
  },
  primaryButton: {
    backgroundColor: "#2563EB",
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  primaryButtonText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "600",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  secondaryButton: {
    marginTop: 6,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
  },
  secondaryButtonText: {
    color: "#94A3B8",
    fontSize: 15,
    fontWeight: "600",
  },
  dangerButton: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.3)",
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  dangerText: {
    color: "#EF4444",
    fontSize: 16,
    fontWeight: "600",
  },
  onHeadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  checkCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(34, 197, 94, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(34, 197, 94, 0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  checkText: {
    color: "#22C55E",
    fontSize: 13,
    fontWeight: "800",
  },
  factorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#0F172A",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
  },
  factorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#22C55E",
  },
  factorName: {
    color: "#F8FAFC",
    fontSize: 15,
    fontWeight: "600",
    flex: 1,
  },
  factorMeta: {
    color: "#22C55E",
    fontSize: 12,
    fontWeight: "700",
  },
  errorBox: {
    backgroundColor: "rgba(239, 68, 68, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.3)",
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  errorBoxInline: {
    marginBottom: 12,
  },
  errorText: {
    color: "#FCA5A5",
    fontSize: 14,
    lineHeight: 20,
  },
  retryButton: {
    alignSelf: "flex-start",
    marginTop: 8,
    minHeight: 40,
    justifyContent: "center",
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    borderRadius: 8,
  },
  retryText: {
    color: "#F8FAFC",
    fontSize: 14,
    fontWeight: "600",
  },
});
