import { todayInTimeZone } from "@notesia/domain";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { deviceTimeZone, UNSET_TIME_ZONE } from "@/shared/time-zones";
import { saveWeek, type WeekSetup } from "./save-week";

/** Zona y fecha de hoy del teléfono: la semana se guarda en esa zona. */
export function useLocalToday(profileTimeZone: string) {
  const device = deviceTimeZone();
  const timeZone = device !== UNSET_TIME_ZONE ? device : profileTimeZone;
  return { timeZone, today: todayInTimeZone(new Date().toISOString(), timeZone) };
}

/** Guardar la semana con progreso; al terminar la app entra sola (perfil configurado). */
export function useSaveWeek(timeZone: string, today: string) {
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState({ saved: 0, total: 0 });
  // Mismos ids al reintentar: lo ya creado no se duplica.
  const eventIds = useRef(new Map<string, string>());
  const finish = useMutation({
    mutationFn: (setup: WeekSetup) =>
      saveWeek({
        setup,
        timeZone,
        today,
        eventIds: eventIds.current,
        onProgress: (saved, total) => setProgress({ saved, total }),
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(["profile"], updated);
      void queryClient.invalidateQueries();
    },
  });
  return { finish, progress };
}
