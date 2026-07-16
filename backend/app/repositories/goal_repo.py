from app.domain.models import Goal
from app.repositories.base import BaseRepository


class GoalRepository(BaseRepository[Goal]):
    def __init__(self, db):
        super().__init__(Goal, db)
