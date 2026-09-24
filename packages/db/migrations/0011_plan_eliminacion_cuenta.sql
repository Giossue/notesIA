alter table dominio.bloques_plan drop constraint bloques_plan_actividad_fk;
alter table dominio.bloques_plan add constraint bloques_plan_actividad_fk
  foreign key (usuario_id, actividad_id) references dominio.actividades(usuario_id, id)
  on delete cascade;

alter table dominio.trabajo_no_asignado
  drop constraint trabajo_no_asignado_usuario_id_actividad_id_fkey;
alter table dominio.trabajo_no_asignado
  add constraint trabajo_no_asignado_actividad_fk
  foreign key (usuario_id, actividad_id) references dominio.actividades(usuario_id, id)
  on delete cascade;

alter table dominio.riesgos_plan drop constraint riesgos_plan_usuario_id_actividad_id_fkey;
alter table dominio.riesgos_plan add constraint riesgos_plan_actividad_fk
  foreign key (usuario_id, actividad_id) references dominio.actividades(usuario_id, id)
  on delete cascade;
