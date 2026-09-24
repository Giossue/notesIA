create extension if not exists btree_gist with schema public;

-- Existing intervals must be reviewed, never silently shortened or discarded.
do $$
begin
  if exists (
    select 1
    from dominio.registros_tiempo a
    join dominio.registros_tiempo b
      on a.usuario_id = b.usuario_id and a.id < b.id
     and tstzrange(a.inicia_en, coalesce(a.termina_en, 'infinity'::timestamptz), '[)')
       && tstzrange(b.inicia_en, coalesce(b.termina_en, 'infinity'::timestamptz), '[)')
  ) then
    raise exception 'time entry migration refused: overlapping intervals require review';
  end if;
end;
$$;

alter table dominio.registros_tiempo
  add constraint registros_tiempo_usuario_intervalo_excl
  exclude using gist (
    usuario_id with =,
    (tstzrange(inicia_en, coalesce(termina_en, 'infinity'::timestamptz), '[)')) with &&
  );
