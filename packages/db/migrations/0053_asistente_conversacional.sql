-- Asistente conversacional: nuevo caso de uso de IA "assistant_chat".
-- Las cuatro tablas que restringen el caso admiten ahora también el chat.
alter table "dominio"."rutas_ia" drop constraint "rutas_ia_caso_check";
alter table "dominio"."rutas_ia" add constraint "rutas_ia_caso_check" check (caso in (
  'extract_activity', 'estimate_duration', 'explain_risk', 'explain_replan', 'propose_subtasks',
  'assistant_chat'
));
alter table "dominio"."uso_ia" drop constraint "uso_ia_caso_check";
alter table "dominio"."uso_ia" add constraint "uso_ia_caso_check" check (caso in (
  'extract_activity', 'estimate_duration', 'explain_risk', 'explain_replan', 'propose_subtasks',
  'assistant_chat'
));
alter table "dominio"."fallback_ia" drop constraint "fallback_ia_caso_check";
alter table "dominio"."fallback_ia" add constraint "fallback_ia_caso_check" check (caso in (
  'extract_activity', 'estimate_duration', 'explain_risk', 'explain_replan', 'propose_subtasks',
  'assistant_chat'
));
alter table "dominio"."transiciones_ia" drop constraint "transiciones_ia_caso_check";
alter table "dominio"."transiciones_ia" add constraint "transiciones_ia_caso_check" check (caso in (
  'extract_activity', 'estimate_duration', 'explain_risk', 'explain_replan', 'propose_subtasks',
  'assistant_chat'
));
