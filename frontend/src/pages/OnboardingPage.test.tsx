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

async function reachNameStep(user: ReturnType<typeof userEvent.setup>) {
  renderOnboarding()
  expect(
    screen.getByRole("heading", { name: "Welcome to Momentum" })
  ).toBeInTheDocument()
  await user.click(screen.getByRole("button", { name: /get started/i }))
}

describe("OnboardingPage", () => {
  it("reaches the weekday step and speaks in plain language about busy times", async () => {
    const user = userEvent.setup()
    renderOnboarding()

    expect(
      screen.getByRole("heading", { name: "Welcome to Momentum" })
    ).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /get started/i }))

    await user.type(screen.getByPlaceholderText(/your name/i), "Alex")
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

  it("asks for the name with friendly copy and no example names", async () => {
    const user = userEvent.setup()
    await reachNameStep(user)

    expect(screen.getByText("What should I call you?")).toBeInTheDocument()
    expect(
      screen.getByText("We'll use this name throughout Momentum. You can change it later.")
    ).toBeInTheDocument()
    expect(screen.getByPlaceholderText("Your name")).toBeInTheDocument()
    expect(screen.queryByPlaceholderText(/e\.g\./i)).not.toBeInTheDocument()
  })

  it("focuses the name input automatically", async () => {
    const user = userEvent.setup()
    await reachNameStep(user)

    const input = screen.getByPlaceholderText("Your name")
    expect(input).toHaveFocus()
  })

  it("advances to the next step when Enter is pressed", async () => {
    const user = userEvent.setup()
    await reachNameStep(user)

    const input = screen.getByPlaceholderText("Your name")
    await user.type(input, "Alex{enter}")

    expect(screen.getByText("What's waiting to be studied?")).toBeInTheDocument()
  })

  it("trims leading and trailing whitespace before saving", async () => {
    const user = userEvent.setup()
    await reachNameStep(user)

    const input = screen.getByPlaceholderText("Your name")
    await user.type(input, "   Jay   {enter}")

    expect(screen.getByText("What's waiting to be studied?")).toBeInTheDocument()
  })

  it("does not allow a name consisting only of spaces", async () => {
    const user = userEvent.setup()
    await reachNameStep(user)

    const input = screen.getByPlaceholderText("Your name")
    await user.type(input, "   ")

    expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled()
  })
})
