import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { describe, expect, it } from "vitest"

import { OnboardingPage } from "@/pages/OnboardingPage"

function renderOnboarding() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <OnboardingPage />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe("OnboardingPage", () => {
  it("reaches the weekday step and speaks in plain language about busy times", async () => {
    const user = userEvent.setup()
    renderOnboarding()

    expect(
      screen.getByRole("heading", { name: "Welcome to Momentum" })
    ).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /get started/i }))

    await user.type(screen.getByPlaceholderText(/e\.g\. Priyani/i), "Alex")
    await user.click(screen.getByRole("button", { name: /continue/i }))

    expect(screen.getByText("What's waiting to be studied?")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /build my plan/i }))
    await user.click(screen.getByRole("button", { name: /looks correct/i }))

    await user.click(screen.getByRole("button", { name: /continue/i }))

    expect(
      screen.getByText("What's fixed on a normal weekday?")
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Tell us about your busy times — school, coaching, sports/i)
    ).toBeInTheDocument()
  })
})
