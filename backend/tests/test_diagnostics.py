from app.core.diagnostics import begin_request, current_request_id, end_request


def test_request_diagnostic_context_is_scoped():
    assert current_request_id() == "-"
    request_id, token = begin_request()
    try:
        assert len(request_id) == 12
        assert current_request_id() == request_id
    finally:
        end_request(token)

    assert current_request_id() == "-"
