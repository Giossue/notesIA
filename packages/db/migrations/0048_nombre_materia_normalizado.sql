-- El nombre de una materia es único sin distinguir mayúsculas, tildes ni
-- espacios: "Cálculo I", "calculo i" y "  CALCULO   I " son la misma materia.
create extension if not exists unaccent schema public;

-- unaccent() es STABLE porque su diccionario puede cambiar; fijar el
-- diccionario permite declararla IMMUTABLE y usarla en un índice.
create function "dominio"."normalizar_nombre"(texto text) returns text
  language sql immutable strict parallel safe
  as $$
    select lower(regexp_replace(btrim(public.unaccent('public.unaccent'::regdictionary, texto)), '\s+', ' ', 'g'))
  $$;

-- Los nombres guardados quedan con espacios simples, igual que los nuevos.
update "dominio"."materias"
  set "nombre" = regexp_replace(btrim("nombre"), '\s+', ' ', 'g')
  where "nombre" <> regexp_replace(btrim("nombre"), '\s+', ' ', 'g');

drop index "dominio"."materias_usuario_nombre_activo_uq";
create unique index "materias_usuario_nombre_activo_uq" on "dominio"."materias"
  ("usuario_id", "dominio"."normalizar_nombre"("nombre"))
  where "archivado_en" is null and "eliminado_en" is null;
