export type RootStackParamList = {
  Home: undefined;
  Profile: undefined;
  Subjects: undefined;
  SubjectForm: { id?: string };
  Activities: undefined;
  ActivityForm: {
    id?: string;
    draft?: { title?: string; description?: string; estimatedMinutes?: number };
  };
  Agenda: undefined;
  Events: undefined;
  EventForm: { id?: string };
  Tools: undefined;
  AcademicPeriods: undefined;
  AcademicPeriodForm: { id?: string };
  Availability: undefined;
  Planning: undefined;
  TimeTracking: undefined;
  ActivitySeries: undefined;
  ActivitySeriesForm: undefined;
  Notifications: undefined;
  Preferences: undefined;
  Privacy: undefined;
  AiAssistant: undefined;
  Account: undefined;
  OfflineChanges: undefined;
};
