from datetime import date

import pytest

from datetime import date

from app.services.schedule_service import (
    compute_available_windows,
    compute_total_available_minutes,
    _parse_time,
    _get_day_from_date,
    _compute_energy_rating,
)


class TestParseTime:
    def test_parse_time_morning(self):
        assert _parse_time("07:30") == 450

    def test_parse_time_midnight(self):
        assert _parse_time("00:00") == 0

    def test_parse_time_end_of_day(self):
        assert _parse_time("23:59") == 1439


class TestGetDayFromDate:
    def test_monday(self):
        d = date(2026, 7, 20)
        assert _get_day_from_date(d) == "monday"

    def test_sunday(self):
        d = date(2026, 7, 26)
        assert _get_day_from_date(d) == "sunday"


class TestEnergyRating:
    def test_morning_peak_morning_window(self):
        assert _compute_energy_rating(420, "morning") == "high"

    def test_morning_peak_night_window(self):
        assert _compute_energy_rating(1320, "morning") == "low"

    def test_night_peak_night_window(self):
        assert _compute_energy_rating(1320, "night") == "high"

    def test_no_peak_defaults_medium(self):
        assert _compute_energy_rating(600, None) == "medium"


MONDAY = date(2026, 7, 20)
TUESDAY = date(2026, 7, 21)


class TestComputeAvailableWindows:
    def test_no_schedule_returns_empty(self):
        result = compute_available_windows(None, None, None)
        assert result == []

    def test_empty_schedule_returns_full_window(self):
        result = compute_available_windows({"monday": []}, {"start": "22:00", "end": "06:00"}, None, target_date=MONDAY)
        assert len(result) > 0

    def test_school_blocks_removed(self):
        schedule = {
            "monday": [
                {"type": "school", "start": "08:00", "end": "14:00"},
            ]
        }
        result = compute_available_windows(schedule, {"start": "22:00", "end": "06:00"}, {"earliest_start": "06:00", "latest_end": "22:00"}, target_date=MONDAY)
        for w in result:
            assert not (w["start"] < "14:00" and w["end"] > "08:00")

    def test_no_gaps_returns_empty(self):
        schedule = {
            "monday": [
                {"type": "school", "start": "06:00", "end": "22:00"},
            ]
        }
        result = compute_available_windows(schedule, {"start": "22:00", "end": "06:00"}, {"earliest_start": "06:00", "latest_end": "22:00"}, target_date=MONDAY)
        assert len(result) == 0

    def test_multiple_windows(self):
        schedule = {
            "monday": [
                {"type": "school", "start": "08:00", "end": "14:00"},
                {"type": "coaching", "start": "16:00", "end": "18:00"},
            ]
        }
        result = compute_available_windows(
            schedule,
            {"start": "22:00", "end": "06:00"},
            {"earliest_start": "06:00", "latest_end": "22:00"},
            target_date=MONDAY,
        )
        assert len(result) == 3

    def test_energy_rating_included(self):
        schedule = {
            "monday": [
                {"type": "school", "start": "13:00", "end": "14:00"},
            ]
        }
        result = compute_available_windows(
            schedule, {"start": "22:00", "end": "06:00"}, {"earliest_start": "06:00", "latest_end": "22:00"}, "morning", target_date=MONDAY
        )
        morning_windows = [w for w in result if w["energy_rating"] == "high"]
        assert len(morning_windows) > 0

    def test_sleep_over_midnight(self):
        schedule = {"tuesday": [{"type": "school", "start": "08:00", "end": "14:00"}]}
        result = compute_available_windows(
            schedule,
            {"start": "23:00", "end": "06:00"},
            {"earliest_start": "06:00", "latest_end": "23:00"},
            target_date=TUESDAY,
        )
        for w in result:
            assert not (w["start"] < "06:00" and w["end"] > "23:00")


class TestComputeTotalAvailableMinutes:
    def test_single_window(self):
        windows = [{"total_minutes": 120, "start": "08:00", "end": "10:00", "energy_rating": "high"}]
        assert compute_total_available_minutes(windows) == 120

    def test_multiple_windows(self):
        windows = [
            {"total_minutes": 60, "start": "08:00", "end": "09:00", "energy_rating": "high"},
            {"total_minutes": 90, "start": "14:00", "end": "15:30", "energy_rating": "medium"},
        ]
        assert compute_total_available_minutes(windows) == 150

    def test_empty(self):
        assert compute_total_available_minutes([]) == 0
