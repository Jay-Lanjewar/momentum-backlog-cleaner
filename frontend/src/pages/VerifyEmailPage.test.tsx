import { fireEvent, render, screen } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { VerifyEmailPage } from "@/pages/VerifyEmailPage"
import { AuthError } from "@/hooks/useAuth"

const authState = vi.hoisted(() => ({
  resendVerificationEmail: vi.fn(),
}))

vi.mock("@/hooks/useAuth", () => ({
  AuthError: class AuthError extends Error {
    code?: string
    constructor(message: string, code?: string) {
      super(message)
      this.name = "AuthError"
      this.code = code
    }
  },
  useAuth: () => ({
    user: null,
    isAuthenticated: false,
    isLoading: false,
    signup: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    forgotPassword: vi.fn(),
    signInWithGoogle: vi.fn(),
    resendVerificationEmail: authState.resendVerificationEmail,
  }),
}))

function renderVerify(path: string, state?: { email?: string; reason?: "signup" | "login" }) {
  const entry = state
    ? { pathname: path, state }
    : path
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/login" element={<div>LOGIN PAGE</div>} />
        <Route path="/register" element={<div>REGISTER PAGE</div>} />
      </Routes>
    </MemoryRouter>
  )
}

describe("VerifyEmailPage", () => {
  beforeEach(() => {
    authState.resendVerificationEmail.mockReset()
    authState.resendVerificationEmail.mockResolvedValue("Verification email sent")
  })

  it("shows the signup copy with the email and helpful actions", () => {
    renderVerify("/verify-email", {
      email: "student@example.com",
      reason: "signup",
    })

    expect(screen.getByRole("heading", { name: "Verify your email" })).toBeInTheDocument()
    expect(screen.getByText("We've sent a verification link to:")).toBeInTheDocument()
    expect(screen.getByText("student@example.com")).toBeInTheDocument()
    expect(
      screen.getByText("Please open your inbox and click the verification link before signing in.")
    ).toBeInTheDocument()

    expect(screen.getByText("Didn't receive it?")).toBeInTheDocument()
    expect(screen.getByText("Check Spam")).toBeInTheDocument()
    expect(screen.getByText("Wait a minute")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Resend Email" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Change Email" })).toBeInTheDocument()
  })

  it("shows the login copy when arriving from an unverified login", () => {
    renderVerify("/verify-email", {
      email: "student@example.com",
      reason: "login",
    })

    expect(screen.getByText("Please verify your email first.")).toBeInTheDocument()
    expect(screen.getByText("We already sent a verification email.")).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Resend verification email" })
    ).toBeInTheDocument()
  })

  it("reads the email from the query string when no navigation state is present", () => {
    renderVerify("/verify-email?email=student%40example.com")
    expect(screen.getByText("student@example.com")).toBeInTheDocument()
  })

  it("resends the email and confirms", async () => {
    renderVerify("/verify-email", {
      email: "student@example.com",
      reason: "signup",
    })

    fireEvent.click(screen.getByRole("button", { name: "Resend Email" }))

    expect(authState.resendVerificationEmail).toHaveBeenCalledWith("student@example.com")
    expect(
      await screen.findByText("We sent another verification email. Check your inbox.")
    ).toBeInTheDocument()
  })

  it("resends from the login block and surfaces errors", async () => {
    authState.resendVerificationEmail.mockRejectedValue(
      new AuthError("Couldn't resend the email. Please try again in a minute.")
    )
    renderVerify("/verify-email", {
      email: "student@example.com",
      reason: "login",
    })

    fireEvent.click(
      screen.getByRole("button", { name: "Resend verification email" })
    )

    expect(
      await screen.findByText("Couldn't resend the email. Please try again in a minute.")
    ).toBeInTheDocument()
  })

  it("links back to sign in", () => {
    renderVerify("/verify-email", {
      email: "student@example.com",
      reason: "signup",
    })

    fireEvent.click(screen.getByRole("button", { name: "Back to sign in" }))
    expect(screen.getByText("LOGIN PAGE")).toBeInTheDocument()
  })
})
