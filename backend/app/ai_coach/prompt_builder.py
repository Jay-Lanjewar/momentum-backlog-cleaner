"""Build an LLM prompt from a :class:`CoachContext`.

This is the seam for future Gemini/OpenAI providers: they render the context
with :func:`build_prompt`, send it to the model, and parse the response back
into a :class:`CoachingResult`. The prompt explicitly instructs the model to
only explain the plan, never change it.
"""
from __future__ import annotations

from .contract import CoachContext


def _format_item(item: dict) -> str:
    due = item.get("due_date")
    overdue = "overdue" if item.get("overdue") else ""
    fields = [
        f"id: {item.get('id')}",
        f"title: {item.get('title')}",
    ]
    if item.get("course_name"):
        fields.append(f"course: {item['course_name']}")
    if item.get("priority") is not None:
        fields.append(f"priority: {item['priority']}")
    if item.get("score") is not None:
        fields.append(f"score: {item['score']}")
    if item.get("estimated_minutes") is not None:
        fields.append(f"estimated_minutes: {item['estimated_minutes']}")
    if due:
        fields.append(f"due_date: {due}")
    if overdue:
        fields.append("status: overdue")
    return "; ".join(fields)


def build_prompt(context: CoachContext) -> str:
    sections = [
        "You are a study coach. Explain the planner's decisions. "
        "NEVER change, add, or remove sessions, durations, order, or any "
        "decision made by the planner. Produce only explanations and a summary.",
        "",
        "Planned sessions (in order):",
    ]
    for session in context.sessions:
        sections.append(
            f"- {session.get('start_time')}-{session.get('end_time')} "
            f"backlog_item_id={session.get('backlog_item_id')} "
            f"reason={session.get('reason')} "
            f"remaining_minutes={session.get('remaining_minutes')}"
        )

    if context.overflow:
        sections.append("")
        sections.append("Unscheduled (overflow) item ids: " + ", ".join(context.overflow))

    sections.append("")
    sections.append("Backlog items (public facts only):")
    for item in context.backlog:
        sections.append(f"- {_format_item(item)}")

    if context.completions:
        sections.append("")
        sections.append("Completion history:")
        for completion in context.completions:
            sections.append(
                f"- backlog_item_id={completion.get('backlog_item_id')} "
                f"session_number={completion.get('session_number')} "
                f"status={completion.get('status')} "
                f"completed_minutes={completion.get('completed_minutes')}"
            )

    sections.append("")
    sections.append(
        "Output exactly one short reason per session (same order) and one "
        "2-4 sentence daily summary."
    )
    return "\n".join(sections)
