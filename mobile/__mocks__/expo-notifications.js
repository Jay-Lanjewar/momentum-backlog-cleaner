const Notifications = {
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn().mockResolvedValue({ status: "undetermined" }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ status: "granted" }),
  setNotificationChannelAsync: jest.fn().mockResolvedValue(undefined),
  getNotificationChannelsAsync: jest.fn().mockResolvedValue([]),
  scheduleNotificationAsync: jest.fn().mockResolvedValue("test-notification-id"),
  cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
  cancelAllScheduledNotificationsAsync: jest.fn().mockResolvedValue(undefined),
  getAllScheduledNotificationsAsync: jest.fn().mockResolvedValue([]),
  getLastNotificationResponse: jest.fn().mockReturnValue(null),
  addNotificationResponseReceivedListener: jest.fn().mockReturnValue({
    remove: jest.fn(),
  }),
  addNotificationReceivedListener: jest.fn().mockReturnValue({
    remove: jest.fn(),
  }),
  dismissAllNotificationsAsync: jest.fn().mockResolvedValue(undefined),
  dismissNotificationAsync: jest.fn().mockResolvedValue(undefined),
  getPresentedNotificationsAsync: jest.fn().mockResolvedValue([]),
  AndroidImportance: {
    MAX: 4,
    HIGH: 3,
    DEFAULT: 2,
    LOW: 1,
    MIN: 0,
  },
  SchedulableTriggerInputTypes: {
    TIME_INTERVAL: 0,
    DATE: 1,
    CALENDAR: 2,
    DAILY: 3,
    WEEKLY: 4,
  },
  DEFAULT_ACTION_IDENTIFIER: "__default",
};

module.exports = Notifications;
