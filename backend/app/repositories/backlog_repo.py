from app.domain.models import BacklogItem
from app.repositories.base import BaseRepository


class BacklogItemRepository(BaseRepository[BacklogItem]):
    def __init__(self, db):
        super().__init__(BacklogItem, db)
