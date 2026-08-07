import { useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  Mail,
  RefreshCw,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Clock,
  MailOpen,
  PenLine,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { FadeIn } from "@/components/ui/fade-in";
import { AuthError, useAuth } from "@/hooks/useAuth";

interface VerifyEmailState {
  email?: string;
  reason?: "signup" | "login";
}

export function VerifyEmailPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { resendVerificationEmail } = useAuth();

  const state = (location.state ?? null) as VerifyEmailState | null;
  const email = state?.email ?? searchParams.get("email") ?? "";
  const reason = state?.reason ?? "signup";

  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState("");
  const [resendError, setResendError] = useState("");

  const handleResend = async () => {
    if (!email || resending) return;
    setResending(true);
    setResendMessage("");
    setResendError("");
    try {
      await resendVerificationEmail(email);
      setResendMessage("We sent another verification email. Check your inbox.");
    } catch (err) {
      setResendError(
        err instanceof AuthError
          ? err.message
          : "Couldn't resend the email. Please try again in a minute."
      );
    } finally {
      setResending(false);
    }
  };

  const resendDisabled = !email || resending;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6">
        <FadeIn delay={0}>
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary shadow-sm">
              <Mail className="h-6 w-6 text-primary-foreground" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">Verify your email</h1>
            <p className="text-sm text-muted-foreground">
              One quick step before you start studying
            </p>
          </div>
        </FadeIn>

        <FadeIn delay={0.05}>
          <div className="rounded-xl border bg-card p-5 space-y-2 text-center">
            {reason === "login" ? (
              <>
                <p className="text-sm font-semibold">Please verify your email first.</p>
                <p className="text-sm text-muted-foreground">We already sent a verification email.</p>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">We've sent a verification link to:</p>
                <p className="text-base font-medium break-words">{email || "your email"}</p>
                <p className="text-sm text-muted-foreground">
                  Please open your inbox and click the verification link before signing in.
                </p>
              </>
            )}
          </div>
        </FadeIn>

        {reason === "login" && (
          <FadeIn delay={0.08}>
            <Button
              type="button"
              onClick={handleResend}
              disabled={resendDisabled}
              className="w-full h-10 rounded-lg gap-2"
            >
              {resending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {resending ? "Sending..." : "Resend verification email"}
            </Button>
          </FadeIn>
        )}

        <FadeIn delay={0.1}>
          <div className="rounded-xl border bg-card p-5 space-y-3">
            <p className="text-sm font-medium">Didn't receive it?</p>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-center gap-2">
                <MailOpen className="h-4 w-4 text-muted-foreground/70" />
                Check Spam
              </li>
              <li className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground/70" />
                Wait a minute
              </li>
              <li className="flex items-center gap-2">
                <RefreshCw className="h-4 w-4 text-muted-foreground/70" />
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resendDisabled}
                  className="text-left text-foreground hover:text-primary transition-colors disabled:opacity-50"
                >
                  Resend Email
                </button>
              </li>
              <li className="flex items-center gap-2">
                <PenLine className="h-4 w-4 text-muted-foreground/70" />
                <Link
                  to={email ? `/register?email=${encodeURIComponent(email)}` : "/register"}
                  className="text-foreground hover:text-primary transition-colors"
                >
                  Change Email
                </Link>
              </li>
            </ul>
          </div>
        </FadeIn>

        {resendMessage && (
          <FadeIn delay={0.05}>
            <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>{resendMessage}</span>
            </div>
          </FadeIn>
        )}

        {resendError && (
          <FadeIn delay={0.05}>
            <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{resendError}</span>
            </div>
          </FadeIn>
        )}

        <FadeIn delay={0.15}>
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate("/login")}
            className="w-full h-10 rounded-lg"
          >
            Back to sign in
          </Button>
        </FadeIn>
      </div>
    </div>
  );
}
