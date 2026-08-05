import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { BacklogPage } from "@/pages/BacklogPage"
import { dueDateForChip } from "@/lib/coaching"
import type { CourseData } from "@/services/types"

const mocks = vi.hoisted(() => ({
  createItem: vi.fn(),
  updateItem: vi.fn(),
  deleteItem: vi.fn(),
  courses: [
    {
      id: "c1",
      user_id: "u1",
      name: "Chemistry",
      color: "#22c55e",
      created_at: "",
      updated_at: "",
    },
  ] as CourseData[],
  items: [] as any[],
}))

vi.mock("@/services/hooks", () => ({
  useCourses: () => ({ data: mocks.courses, isLoading: false }),
  useBacklogItems: () => ({ data: mocks.items, isLoading: false }),
  useCreateBacklogItem: () => ({ mutateAsync: mocks.createItem, isPending: false }),
  useUpdateBacklogItem: () => ({ mutateAsync: mocks.updateItem, isPending: false }),
  useDeleteBacklogItem: () => ({ mutateAsync: mocks.deleteItem, isPending: false }),
  useCreateCourse: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

function renderBacklog() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <BacklogPage />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

async function openAddWorkForm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getAllByRole("button", { name: /add work/i })[0])
}

describe("BacklogPage", () => {
  beforeEach(() => {
    mocks.items = []
    mocks.createItem.mockReset()
  })

  it("educates the user in the empty state instead of saying 'No tasks'", () => {
    renderBacklog()
    expect(screen.getByText("No work yet.")).toBeInTheDocument()
    expect(
      screen.getByText(
        "Add your homework and Momentum will automatically build today's study plan."
      )
    ).toBeInTheDocument()
  })

  it("opens a task form with difficulty and due chips, hiding manual minutes by default", async () => {
    const user = userEvent.setup()
    renderBacklog()

    await openAddWorkForm(user)

    expect(screen.getByRole("heading", { name: "New task" })).toBeInTheDocument()
    expect(screen.getByLabelText("Task name")).toBeInTheDocument()
    expect(screen.getByLabelText("Subject")).toBeInTheDocument()

    const difficultyGroup = screen.getByText("Difficulty").parentElement!
    expect(
      within(difficultyGroup).getByRole("button", { name: /Easy/ })
    ).toBeInTheDocument()
    expect(
      within(difficultyGroup).getByRole("button", { name: /Medium/ })
    ).toBeInTheDocument()
    expect(
      within(difficultyGroup).getByRole("button", { name: /Hard/ })
    ).toBeInTheDocument()

    for (const chip of ["Today", "Tomorrow", "This Week", "Custom"]) {
      expect(screen.getByRole("button", { name: chip })).toBeInTheDocument()
    }

    // Manual minutes are hidden behind Advanced so students don't have to estimate.
    expect(screen.queryByLabelText("Est. minutes")).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Advanced" }))
    expect(screen.getByLabelText("Est. minutes")).toBeInTheDocument()
  })

  it("submits with the difficulty mapped to priority and no manual minutes", async () => {
    const user = userEvent.setup()
    renderBacklog()

    await openAddWorkForm(user)

    await user.type(screen.getByLabelText("Task name"), "Chapter 5 exercises")
    await user.click(screen.getByRole("button", { name: /Hard/ }))
    await user.click(screen.getByRole("button", { name: "Tomorrow" }))

    await user.click(screen.getByRole("button", { name: "Add Task" }))

    expect(mocks.createItem).toHaveBeenCalledTimes(1)
    const payload = mocks.createItem.mock.calls[0][0]
    expect(payload).toMatchObject({
      title: "Chapter 5 exercises",
      course_id: "c1",
      priority: 1,
      due_date: new Date(dueDateForChip("tomorrow")).toISOString(),
    })
    expect(payload.estimated_minutes).toBeUndefined()
  })

  it("lets the student override minutes from the Advanced section", async () => {
    const user = userEvent.setup()
    renderBacklog()

    await openAddWorkForm(user)

    await user.type(screen.getByLabelText("Task name"), "Physics derivations")
    await user.click(screen.getByRole("button", { name: "Advanced" }))
    await user.type(screen.getByLabelText("Est. minutes"), "90")

    await user.click(screen.getByRole("button", { name: "Add Task" }))

    const payload = mocks.createItem.mock.calls[0][0]
    expect(payload.estimated_minutes).toBe(90)
  })

  it("shows difficulty badges on existing tasks", () => {
    mocks.items = [
      {
        id: "b1",
        user_id: "u1",
        course_id: "c1",
        title: "Stoichiometry",
        description: null,
        priority: 3,
        estimated_minutes: null,
        due_date: null,
        status: "pending",
        created_at: "",
        updated_at: "",
      },
    ]
    renderBacklog()
    expect(screen.getByText("Stoichiometry")).toBeInTheDocument()
    expect(screen.getByText("Medium")).toBeInTheDocument()
  })
})
