import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { describe, expect, it } from "vitest"

import { SchedulePage } from "@/pages/SchedulePage"

function renderSchedule() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  })
  // Seed an empty weekly schedule so the query never hits the network.
  queryClient.setQueryData(["schedule"], { schedule: {} })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <SchedulePage />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe("SchedulePage", () => {
  it("is titled Fixed Commitments and explains that study sessions are scheduled around them", () => {
    renderSchedule()
    expect(
      screen.getByRole("heading", { name: "Fixed Commitments" })
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        "Add only the parts of your week that are fixed. Momentum will automatically schedule study sessions around them."
      )
    ).toBeInTheDocument()
  })

  it("shows helper cards with add / do-not-add examples without opening docs", () => {
    renderSchedule()
    expect(screen.getByText("What should I add?")).toBeInTheDocument()
    expect(screen.getByText("What should I NOT add?")).toBeInTheDocument()

    for (const example of ["School", "Coaching", "Meals", "Sports", "Work", "Sleep"]) {
      expect(screen.getAllByText(example).length).toBeGreaterThan(0)
    }
    for (const example of ["Study time", "Homework", "Flexible free time"]) {
      expect(screen.getAllByText(example).length).toBeGreaterThan(0)
    }
  })

  it("uses plain-language empty states instead of generic schedule cards", () => {
    renderSchedule()
    expect(screen.getAllByText("No fixed commitments")).toHaveLength(7)
    expect(screen.getAllByText("+ Add commitment")).toHaveLength(7)
    expect(screen.queryByText("No schedule yet")).not.toBeInTheDocument()
    expect(screen.queryByText("Weekly Schedule")).not.toBeInTheDocument()
    expect(screen.queryByText("Save Schedule")).not.toBeInTheDocument()
  })

  it("opens the add-commitment modal with plain-language copy", async () => {
    const user = userEvent.setup()
    renderSchedule()

    await user.click(screen.getAllByRole("button", { name: /add commitment/i })[0])

    expect(
      screen.getByRole("heading", { name: "Add fixed commitment" })
    ).toBeInTheDocument()
    expect(screen.getByText("Category")).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Add Commitment" })
    ).toBeInTheDocument()
  })
})
