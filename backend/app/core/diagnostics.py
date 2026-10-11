from contextvars import ContextVar
import uuid


_request_id: ContextVar[str] = ContextVar("request_id", default="-")


def begin_request() -> tuple[str, object]:
    request_id = uuid.uuid4().hex[:12]
    return request_id, _request_id.set(request_id)


def end_request(token: object) -> None:
    _request_id.reset(token)


def current_request_id() -> str:
    return _request_id.get()
