import importlib
from unittest.mock import MagicMock, patch

import pytest

import app.core.security as security_module


@pytest.fixture(autouse=True)
def _reset_jwks_singleton():
    """Reset the module-level singleton between tests."""
    original = security_module._jwks_client
    security_module._jwks_client = None
    yield
    security_module._jwks_client = original


class TestJwksClientReuse:
    def test_first_call_creates_pyjwk_client(self):
        mock_client = MagicMock()
        with patch("jwt.PyJWKClient", return_value=mock_client) as MockPyJWK:
            client = security_module._get_jwks_client()

        MockPyJWK.assert_called_once()
        assert client is mock_client

    def test_second_call_returns_same_instance(self):
        mock_client = MagicMock()
        with patch("jwt.PyJWKClient", return_value=mock_client) as MockPyJWK:
            first = security_module._get_jwks_client()
            second = security_module._get_jwks_client()

        MockPyJWK.assert_called_once()
        assert first is second
        assert first is mock_client

    def test_verify_token_reuses_jwks_client_across_calls(self):
        mock_client = MagicMock()
        mock_signing_key = MagicMock()
        mock_signing_key.key = "fake-key"
        mock_client.get_signing_key_from_jwt.return_value = mock_signing_key

        with patch("jwt.PyJWKClient", return_value=mock_client) as MockPyJWK:
            with patch("jwt.decode", return_value={"sub": "user-1"}) as mock_decode:
                security_module.verify_token("token-a")
                security_module.verify_token("token-b")

        MockPyJWK.assert_called_once()
        assert mock_client.get_signing_key_from_jwt.call_count == 2
        assert mock_decode.call_count == 2

    def test_singleton_persists_across_verify_token_calls(self):
        mock_client = MagicMock()
        mock_signing_key = MagicMock()
        mock_signing_key.key = "fake-key"
        mock_client.get_signing_key_from_jwt.return_value = mock_signing_key

        with patch("jwt.PyJWKClient", return_value=mock_client) as MockPyJWK:
            with patch("jwt.decode", return_value={"sub": "user-1"}):
                security_module.verify_token("token-1")
                security_module.verify_token("token-2")
                security_module.verify_token("token-3")

        MockPyJWK.assert_called_once()
        assert security_module._jwks_client is mock_client

    def test_no_network_calls_made(self):
        mock_client = MagicMock()
        mock_signing_key = MagicMock()
        mock_signing_key.key = "fake-key"
        mock_client.get_signing_key_from_jwt.return_value = mock_signing_key

        with patch("jwt.PyJWKClient", return_value=mock_client):
            with patch("jwt.decode", return_value={"sub": "user-1"}):
                security_module.verify_token("token-a")
                security_module.verify_token("token-b")

        mock_client.get_signing_key_from_jwt.assert_called()
        mock_client.get_signing_key_from_jwt.call_args_list[0]
        assert mock_client.get_signing_key_from_jwt.call_count == 2
