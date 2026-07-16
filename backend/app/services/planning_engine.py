import uuid
from datetime import date
from collections.abc import Sequence

from app.domain.models import BacklogItem, Goal, Course, StudentProfile, WeeklySchedule
from app.services.schedule_service import (
    compute_available_windows,
    compute_total_available_minutes,
)
from app.services.priority_service import prioritize_backlog, get_overdue_items
from app.services.health_service import compute_backlog_health


class PlanningEngine:
    def __init__(
        self,
        profile: StudentProfile | None,
        schedule: WeeklySchedule | None,
        courses: Sequence[Course],
        backlog_items: Sequence[BacklogItem],
        goals: Sequence[Goal],
    ):
        self.profile = profile
        self.schedule = schedule
        self.courses = {c.id: c for c in courses}
        self.backlog_items = backlog_items
        self.goals = goals

    def compute(self, target_date: date | None = None) -> dict:
        schedule_data = self.schedule.schedule if self.schedule else None
        sleep_schedule = self.profile.sleep_schedule if self.profile else None
        preferred_window = self.profile.preferred_study_window if self.profile else None
        energy_peak = self.profile.energy_peak if self.profile else None
        avg_daily_minutes = self.profile.daily_target_minutes if self.profile else None

        available_windows = compute_available_windows(
            weekly_schedule=schedule_data,
            sleep_schedule=sleep_schedule,
            preferred_window=preferred_window,
            energy_peak=energy_peak,
            target_date=target_date,
        )

        total_available_minutes = compute_total_available_minutes(available_windows)

        pending_backlog = [i for i in self.backlog_items if i.status in ("pending", "in_progress")]

        scored = prioritize_backlog(
            items=pending_backlog,
            goals=list(self.goals),
            status_filter=None,
        )

        total_required_minutes = sum(
            (item.estimated_minutes or 60) for item, _ in scored
        )

        prioritized_backlog = []
        for item, score in scored:
            course = self.courses.get(item.course_id)
            due = item.due_date
            overdue = False
            if due is not None:
                due_date_only = due.date() if hasattr(due, "date") else due
                overdue = due_date_only < (target_date or date.today())

            prioritized_backlog.append(
                {
                    "id": item.id,
                    "title": item.title,
                    "course_id": item.course_id,
                    "course_name": course.name if course else "Unknown",
                    "course_color": course.color if course else "#6366f1",
                    "priority": item.priority,
                    "score": score,
                    "estimated_minutes": item.estimated_minutes,
                    "due_date": item.due_date,
                    "overdue": overdue,
                    "status": item.status,
                }
            )

        backlog_health = compute_backlog_health(
            items=list(self.backlog_items),
            total_available_minutes=total_available_minutes,
            avg_daily_minutes=avg_daily_minutes,
        )

        estimated_days_to_clear = None
        if backlog_health.get("estimated_completion_date") and total_available_minutes > 0:
            today = target_date or date.today()
            estimated_days_to_clear = round(
                total_required_minutes / max(total_available_minutes, 1), 1
            )

        return {
            "available_windows": available_windows,
            "prioritized_backlog": prioritized_backlog,
            "total_available_minutes": total_available_minutes,
            "total_required_minutes": total_required_minutes,
            "estimated_days_to_clear": estimated_days_to_clear,
            "backlog_health": backlog_health,
        }
