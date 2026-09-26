-- Configuración inicial por conversación: nuevo caso de IA "onboarding_setup".
-- Cada caso usa su propia ruta (proveedor y modelo); ya no hay un único proveedor activo.
alter table "dominio"."rutas_ia" drop constraint "rutas_ia_caso_check";
alter table "dominio"."rutas_ia" add constraint "rutas_ia_caso_check" check (caso in (
  'extract_activity', 'estimate_duration', 'explain_risk', 'explain_replan', 'propose_subtasks',
  'assistant_chat', 'onboarding_setup'
));
alter table "dominio"."uso_ia" drop constraint "uso_ia_caso_check";
alter table "dominio"."uso_ia" add constraint "uso_ia_caso_check" check (caso in (
  'extract_activity', 'estimate_duration', 'explain_risk', 'explain_replan', 'propose_subtasks',
  'assistant_chat', 'onboarding_setup'
));
alter table "dominio"."fallback_ia" drop constraint "fallback_ia_caso_check";
alter table "dominio"."fallback_ia" add constraint "fallback_ia_caso_check" check (caso in (
  'extract_activity', 'estimate_duration', 'explain_risk', 'explain_replan', 'propose_subtasks',
  'assistant_chat', 'onboarding_setup'
));
alter table "dominio"."transiciones_ia" drop constraint "transiciones_ia_caso_check";
alter table "dominio"."transiciones_ia" add constraint "transiciones_ia_caso_check" check (caso in (
  'extract_activity', 'estimate_duration', 'explain_risk', 'explain_replan', 'propose_subtasks',
  'assistant_chat', 'onboarding_setup'
));
