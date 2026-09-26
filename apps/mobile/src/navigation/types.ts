/** Hacia dónde se movió la barra inferior: decide de qué lado entra la pestaña. */
export type TabParams = { direction?: "left" | "right" } | undefined;

export type RootStackParamList = {
  Home: TabParams;
  Progress: TabParams;
  Profile: TabParams;
  ProfileEdit: undefined;
  Activities: undefined;
  ActivityForm: {
    id?: string;
    draft?: { title?: string; description?: string; estimatedMinutes?: number };
    /** Día (AAAA-MM-DD) que se propone como entrega. */
    date?: string;
  };
  Agenda: TabParams;
  Events: undefined;
  EventForm: { id?: string /** Día (AAAA-MM-DD) en que empieza. */; date?: string };
  Availability: undefined;
  Notifications: undefined;
  Alerts: undefined;
  Privacy: undefined;
  /** `prompt` se envía solo al abrir el chat. */
  AiAssistant: { prompt?: string } | undefined;
  OfflineChanges: undefined;
};
