-- Reversión manual local: se niega si existen reenvíos de riesgo que el índice anterior no permite.
begin;
do $$ begin
  if exists (
    select 1 from dominio.notificaciones where tipo = 'risk_alert'
    group by usuario_id, plan_id, actividad_id having count(*) > 1
  ) then
    raise exception 'Repeated risk alerts exist; resolve them before rollback';
  end if;
end $$;
drop index dominio.notificaciones_riesgo_recientes_idx;
create unique index notificaciones_riesgo_unicas on dominio.notificaciones
  (usuario_id, plan_id, actividad_id) where tipo = 'risk_alert';
delete from public.migraciones where version = '0033_reenvio_alertas_riesgo.sql';
commit;
