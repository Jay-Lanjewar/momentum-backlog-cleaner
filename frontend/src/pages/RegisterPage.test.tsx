import { fireEvent, render, screen } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { RegisterPage } from "@/pages/RegisterPage"
import { VerifyEmailPage } from "@/pages/VerifyEmailPage"
import { AuthError } from "@/hooks/useAuth"

const authState = vi.hoisted(() => ({
  signup: vi.fn(),
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
    signup: authState.signup,
    login: vi.fn(),
    logout: vi.fn(),
    forgotPassword: vi.fn(),
    signInWithGoogle: vi.fn(),
    resendVerificationEmail: vi.fn(),
  }),
}))

function renderRegister(initialPath = "/register") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
      </Routes>
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
  fireEvent.change(screen.getByLabelText("Confirm password"), {
    target: { value: "password123" },
  })
}

describe("RegisterPage", () => {
  beforeEach(() => {
    authState.signup.mockReset()
  })

  it("navigates to the Verify Email screen after a successful signup", async () => {
    authState.signup.mockResolvedValue({})
    renderRegister()

    fillForm()
    fireEvent.click(screen.getByRole("button", { name: "Create account" }))

    expect(await screen.findByRole("heading", { name: "Verify your email" })).toBeInTheDocument()
    expect(screen.getByText("We've sent a verification link to:")).toBeInTheDocument()
    expect(screen.getByText("student@example.com")).toBeInTheDocument()
    expect(
      screen.getByText("Please open your inbox and click the verification link before signing in.")
    ).toBeInTheDocument()
  })

  it("redirects to the Verify Email screen when the account exists but is unverified", async () => {
    authState.signup.mockRejectedValue(
      new AuthError("Please verify your email first", "email_not_confirmed")
    )
    renderRegister()

    fillForm()
    fireEvent.click(screen.getByRole("button", { name: "Create account" }))

    expect(await screen.findByRole("heading", { name: "Verify your email" })).toBeInTheDocument()
    expect(screen.getByText("Please verify your email first.")).toBeInTheDocument()
  })

  it("shows a friendly message when the account already exists", async () => {
    authState.signup.mockRejectedValue(
      new AuthError("An account with this email already exists", "account_exists")
    )
    renderRegister()

    fillForm()
    fireEvent.click(screen.getByRole("button", { name: "Create account" }))

    expect(
      await screen.findByText("An account with this email already exists")
    ).toBeInTheDocument()
    expect(
      screen.queryByText("Verify your email", { exact: false })
    ).not.toBeInTheDocument()
  })

  it("shows a friendly message for weak passwords", async () => {
    authState.signup.mockRejectedValue(
      new AuthError("Password is too weak. Use at least 6 characters.", "weak_password")
    )
    renderRegister()

    fillForm()
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "123456" },
    })
    fireEvent.change(screen.getByLabelText("Confirm password"), {
      target: { value: "123456" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Create account" }))

    expect(
      await screen.findByText("Password is too weak. Use at least 6 characters.")
    ).toBeInTheDocument()
  })

  it("prefills the email from the query string", () => {
    renderRegister("/register?email=existing%40example.com")
    expect(
      screen.getByLabelText<HTMLInputElement>("Email").value
    ).toBe("existing@example.com")
  })
})
