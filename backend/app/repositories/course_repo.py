from app.domain.models import Course
from app.repositories.base import BaseRepository


class CourseRepository(BaseRepository[Course]):
    def __init__(self, db):
        super().__init__(Course, db)
