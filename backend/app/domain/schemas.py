import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field, model_validator


class UserResponse(BaseModel):
    id: uuid.UUID
    email: str
    name: str | None = None
    avatar_url: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class StudentProfileBase(BaseModel):
    name: str | None = Field(None, max_length=100)
    class_name: str | None = Field(None, max_length=50)
    board: str | None = Field(None, max_length=50)
    school_timings: dict | None = None
    coaching_timings: dict | None = None
    sleep_schedule: dict | None = None
    energy_peak: str | None = Field(None, max_length=10)
    preferred_study_window: dict | None = None
    daily_target_minutes: int | None = Field(None, ge=15, le=1440)


class StudentProfileCreate(StudentProfileBase):
    pass


class StudentProfileUpdate(BaseModel):
    name: str | None = Field(None, max_length=100)
    class_name: str | None = Field(None, max_length=50)
    board: str | None = Field(None, max_length=50)
    school_timings: dict | None = None
    coaching_timings: dict | None = None
    sleep_schedule: dict | None = None
    energy_peak: str | None = Field(None, max_length=10)
    preferred_study_window: dict | None = None
    daily_target_minutes: int | None = Field(None, ge=15, le=1440)


class StudentProfileResponse(StudentProfileBase):
    id: uuid.UUID
    user_id: uuid.UUID
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class WeeklyScheduleBase(BaseModel):
    schedule: dict


class WeeklyScheduleCreate(WeeklyScheduleBase):
    pass


class WeeklyScheduleUpdate(BaseModel):
    schedule: dict


class WeeklyScheduleResponse(WeeklyScheduleBase):
    id: uuid.UUID
    user_id: uuid.UUID
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class CourseBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    color: str = Field("#6366f1", pattern=r"^#[0-9a-fA-F]{6}$")


class CourseCreate(CourseBase):
    pass


class CourseUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    color: str | None = Field(None, pattern=r"^#[0-9a-fA-F]{6}$")


class CourseResponse(CourseBase):
    id: uuid.UUID
    user_id: uuid.UUID
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class BacklogItemBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    priority: int = Field(3, ge=1, le=4)
    estimated_minutes: int | None = Field(None, ge=5, le=1440)
    due_date: datetime | None = None
    course_id: uuid.UUID


class BacklogItemCreate(BacklogItemBase):
    pass

    @model_validator(mode="after")
    def validate_due_date_not_past(self):
        if self.due_date and self.due_date.timestamp() < 0:
            raise ValueError("due_date cannot be before epoch")
        return self


class BacklogItemUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    priority: int | None = Field(None, ge=1, le=4)
    estimated_minutes: int | None = Field(None, ge=5, le=1440)
    due_date: datetime | None = None
    course_id: uuid.UUID | None = None
    status: str | None = Field(None, pattern=r"^(pending|in_progress|completed|skipped)$")


class BacklogItemResponse(BacklogItemBase):
    id: uuid.UUID
    user_id: uuid.UUID
    status: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class GoalBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    target_date: datetime | None = None
    category: str | None = Field(None, max_length=50)


class GoalCreate(GoalBase):
    pass


class GoalUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    target_date: datetime | None = None
    category: str | None = Field(None, max_length=50)
    status: str | None = Field(None, pattern=r"^(active|achieved|abandoned)$")


class GoalResponse(GoalBase):
    id: uuid.UUID
    user_id: uuid.UUID
    status: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class TimeBlock(BaseModel):
    start: str
    end: str
    total_minutes: int
    energy_rating: str = "medium"


class PrioritizedBacklogItem(BaseModel):
    id: uuid.UUID
    title: str
    course_id: uuid.UUID
    course_name: str
    course_color: str
    priority: int
    score: int
    estimated_minutes: int | None
    due_date: datetime | None
    overdue: bool = False
    status: str


class BacklogHealth(BaseModel):
    total_items: int
    completed_items: int
    overdue_items: int
    pending_items: int
    clear_rate_7d: float
    health_score: str
    estimated_completion_date: datetime | None = None


class PlanningPreviewResponse(BaseModel):
    available_windows: list[TimeBlock]
    prioritized_backlog: list[PrioritizedBacklogItem]
    total_available_minutes: int
    total_required_minutes: int
    estimated_days_to_clear: float | None
    backlog_health: BacklogHealth


class PlanSession(BaseModel):
    backlog_item_id: uuid.UUID
    start_time: str
    end_time: str
    reason: str


class GeneratedPlan(BaseModel):
    sessions: list[PlanSession]
    daily_message: str
    overflow: list[uuid.UUID]


class PlanGenerateResponse(BaseModel):
    plan: GeneratedPlan
    source: str


class StudyStreakResponse(BaseModel):
    current_streak: int
    longest_streak: int
    total_study_days: int
    last_completed_date: datetime | None = None
    recovery_tokens_current: int = 0
    recovery_tokens_earned: int = 0
    recovery_tokens_used: int = 0
    streak_protected_today: bool = False

    model_config = {"from_attributes": True}


class SubjectStreakResponse(BaseModel):
    id: uuid.UUID
    course_id: uuid.UUID
    course_name: str
    course_color: str
    current_streak: int
    longest_streak: int
    last_completion_date: datetime | None = None

    model_config = {"from_attributes": True}


class StreakUpdatePayload(BaseModel):
    completed_subject_ids: list[uuid.UUID]


class StreakAllResponse(BaseModel):
    momentum: StudyStreakResponse
    subjects: list[SubjectStreakResponse]


class BalanceScoreResponse(BaseModel):
    score: int
    message: str | None = None
    neglected_subjects: list[str] = []


class PaginatedResponse(BaseModel):
    items: list
    total: int
    page: int
    per_page: int


# ─── Auth Schemas ───

class AuthLoginRequest(BaseModel):
    email: str
    password: str


class AuthSignupRequest(BaseModel):
    email: str
    password: str
    name: str | None = None


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class ForgotPasswordRequest(BaseModel):
    email: str


class AuthMeResponse(BaseModel):
    id: uuid.UUID
    email: str
    name: str | None = None
    avatar_url: str | None = None
    created_at: datetime
    updated_at: datetime
    profile: StudentProfileResponse | None = None
    streak: StudyStreakResponse | None = None

    model_config = {"from_attributes": True}
