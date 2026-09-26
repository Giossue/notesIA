import {
  type Problem,
  preferencesSchema,
  preferencesUpdateSchema,
  profileSchema,
  profileUpdateSchema,
} from "@notesia/contracts";
import type { PreferenceRepository, ProfileRepository } from "@notesia/db";
import type { Hono } from "hono";

type Session = { user: { id: string; email: string } };
type Dependencies = {
  getSession(headers: Headers): Promise<Session | null>;
  profiles: ProfileRepository;
  preferences?: PreferenceRepository;
};

function toPreferences(row: NonNullable<Awaited<ReturnType<PreferenceRepository["get"]>>>) {
  return preferencesSchema.parse({
    minSessionMinutes: row.minSessionMinutes,
    maxSessionMinutes: row.maxSessionMinutes,
    maxDailyMinutes: row.maxDailyMinutes,
    notificationsEnabled: row.notificationsEnabled,
    pushNotificationsEnabled: row.pushNotificationsEnabled,
    quietStartMinute: row.quietStartMinute,
    quietEndMinute: row.quietEndMinute,
    version: row.version,
    updatedAt: row.updatedAt.toISOString(),
  });
}

function problem(status: 401 | 404 | 409 | 422, code: string, title: string): Problem {
  return {
    type: `https://notesia.local/problems/${code.toLowerCase().replaceAll("_", "-")}`,
    title,
    status,
    code,
    requestId: crypto.randomUUID(),
  };
}

export function registerMeRoutes(app: Hono, dependencies: Dependencies) {
  app.get("/v1/me", async (c) => {
    const session = await dependencies.getSession(c.req.raw.headers);
    if (!session) {
      return c.json(problem(401, "AUTH_REQUIRED", "Inicia sesión para continuar."), 401, {
        "Content-Type": "application/problem+json",
      });
    }

    const profile = await dependencies.profiles.get(session.user.id);
    if (!profile) {
      return c.json(problem(404, "PROFILE_NOT_FOUND", "Perfil no disponible."), 404, {
        "Content-Type": "application/problem+json",
      });
    }

    return c.json(
      profileSchema.parse({
        id: session.user.id,
        email: session.user.email,
        displayName: profile.displayName,
        language: profile.language,
        timeZone: profile.timeZone,
        avatar: profile.avatar,
        onboardingCompleted: profile.onboardingCompletedAt !== null,
        version: profile.version,
        updatedAt: profile.updatedAt.toISOString(),
      }),
    );
  });

  app.patch("/v1/me/profile", async (c) => {
    const session = await dependencies.getSession(c.req.raw.headers);
    if (!session) {
      return c.json(problem(401, "AUTH_REQUIRED", "Inicia sesión para continuar."), 401, {
        "Content-Type": "application/problem+json",
      });
    }

    let input: unknown;
    try {
      input = c.req.header("content-type")?.toLowerCase().startsWith("application/json")
        ? await c.req.json()
        : null;
    } catch {
      input = null;
    }
    const parsed = profileUpdateSchema.safeParse(input);
    if (!parsed.success) {
      return c.json(problem(422, "VALIDATION_FAILED", "Revisa los datos del perfil."), 422, {
        "Content-Type": "application/problem+json",
      });
    }

    const updated = await dependencies.profiles.update(session.user.id, parsed.data);
    if (!updated) {
      return c.json(
        problem(409, "VERSION_CONFLICT", "El perfil cambió. Actualízalo antes de guardar."),
        409,
        { "Content-Type": "application/problem+json" },
      );
    }

    return c.json(
      profileSchema.parse({
        id: session.user.id,
        email: session.user.email,
        displayName: updated.displayName,
        language: updated.language,
        timeZone: updated.timeZone,
        avatar: updated.avatar,
        onboardingCompleted: updated.onboardingCompletedAt !== null,
        version: updated.version,
        updatedAt: updated.updatedAt.toISOString(),
      }),
    );
  });

  app.post("/v1/me/onboarding/complete", async (c) => {
    const session = await dependencies.getSession(c.req.raw.headers);
    if (!session) {
      return c.json(problem(401, "AUTH_REQUIRED", "Inicia sesión para continuar."), 401, {
        "Content-Type": "application/problem+json",
      });
    }
    const profile = await dependencies.profiles.completeOnboarding(session.user.id);
    if (!profile) {
      return c.json(problem(404, "PROFILE_NOT_FOUND", "Perfil no disponible."), 404, {
        "Content-Type": "application/problem+json",
      });
    }
    return c.json(
      profileSchema.parse({
        id: session.user.id,
        email: session.user.email,
        displayName: profile.displayName,
        language: profile.language,
        timeZone: profile.timeZone,
        avatar: profile.avatar,
        onboardingCompleted: true,
        version: profile.version,
        updatedAt: profile.updatedAt.toISOString(),
      }),
    );
  });

  if (dependencies.preferences) {
    const preferences = dependencies.preferences;
    app.get("/v1/me/preferences", async (c) => {
      const session = await dependencies.getSession(c.req.raw.headers);
      if (!session)
        return c.json(problem(401, "AUTH_REQUIRED", "Inicia sesión para continuar."), 401, {
          "Content-Type": "application/problem+json",
        });
      const row = await preferences.get(session.user.id);
      if (!row)
        return c.json(problem(404, "NOT_FOUND", "Preferencias no disponibles."), 404, {
          "Content-Type": "application/problem+json",
        });
      return c.json(toPreferences(row));
    });
    app.patch("/v1/me/preferences", async (c) => {
      const session = await dependencies.getSession(c.req.raw.headers);
      if (!session)
        return c.json(problem(401, "AUTH_REQUIRED", "Inicia sesión para continuar."), 401, {
          "Content-Type": "application/problem+json",
        });
      let body: unknown = null;
      try {
        if (c.req.header("content-type")?.toLowerCase().startsWith("application/json"))
          body = await c.req.json();
      } catch {
        body = null;
      }
      const parsed = preferencesUpdateSchema.safeParse(body);
      if (!parsed.success)
        return c.json(problem(422, "VALIDATION_FAILED", "Preferencias inválidas."), 422, {
          "Content-Type": "application/problem+json",
        });
      const row = await preferences.update(session.user.id, parsed.data);
      if (!row)
        return c.json(problem(409, "VERSION_CONFLICT", "Las preferencias cambiaron."), 409, {
          "Content-Type": "application/problem+json",
        });
      return c.json(toPreferences(row));
    });
  }
}
