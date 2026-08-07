import { fireEvent, render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { LoginPage } from "@/pages/LoginPage"
import { AuthError } from "@/hooks/useAuth"

const authState = vi.hoisted(() => ({
  login: vi.fn(),
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
    login: authState.login,
    logout: vi.fn(),
    forgotPassword: vi.fn(),
    signInWithGoogle: vi.fn(),
    resendVerificationEmail: authState.resendVerificationEmail,
  }),
}))

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={["/login"]}>
      <LoginPage />
    </MemoryRouter>
  )
}

function fillForm() {
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: "student@example.com" },
  })
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: "password123" },
  })
}

describe("LoginPage", () => {
  beforeEach(() => {
    authState.login.mockReset()
    authState.resendVerificationEmail.mockReset()
  })

  it("shows friendly unverified copy when the email is not confirmed", async () => {
    authState.login.mockRejectedValue(
      new AuthError("Please verify your email first", "email_not_confirmed")
    )
    renderLogin()

    fillForm()
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }))

    expect(await screen.findByText("Please verify your email first.")).toBeInTheDocument()
    expect(screen.getByText("We already sent a verification email.")).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Resend verification email" })
    ).toBeInTheDocument()
    expect(screen.queryByText(/email not confirmed/i)).not.toBeInTheDocument()
  })

  it("resends the verification email from the unverified block", async () => {
    authState.login.mockRejectedValue(
      new AuthError("Please verify your email first", "email_not_confirmed")
    )
    authState.resendVerificationEmail.mockResolvedValue("Verification email sent")
    renderLogin()

    fillForm()
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }))

    const resend = await screen.findByRole("button", { name: "Resend verification email" })
    fireEvent.click(resend)

    expect(authState.resendVerificationEmail).toHaveBeenCalledWith("student@example.com")
    expect(
      await screen.findByText("We sent another verification email. Check your inbox.")
    ).toBeInTheDocument()
  })

  it("shows a friendly message for invalid credentials", async () => {
    authState.login.mockRejectedValue(
      new AuthError("Incorrect email or password", "invalid_credentials")
    )
    renderLogin()

    fillForm()
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }))

    expect(await screen.findByText("Incorrect email or password")).toBeInTheDocument()
  })
})
