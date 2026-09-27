import type { QueryClient } from "@tanstack/react-query";

type WithId = { id: string };
type Page<T> = { items: T[] };
type Infinite<T> = { pages: Page<T>[]; pageParams: unknown[] };

/**
 * Cambia en la caché las listas (paginadas o no) y fichas que tengan el objeto
 * con ese id: la pantalla muestra el cambio al instante, aunque sin conexión se
 * envíe después.
 */
export function patchCached<T extends WithId>(
  queryClient: QueryClient,
  keys: unknown[][],
  id: string,
  patch: Partial<T>,
) {
  const apply = (item: T) => (item.id === id ? { ...item, ...patch } : item);
  for (const key of keys)
    queryClient.setQueriesData({ queryKey: key }, (data: unknown) => {
      if (!data || typeof data !== "object") return data;
      if ("pages" in data) {
        const infinite = data as Infinite<T>;
        return {
          ...infinite,
          pages: infinite.pages.map((page) => ({ ...page, items: page.items.map(apply) })),
        };
      }
      if ("items" in data) {
        const list = data as Page<T>;
        return { ...list, items: list.items.map(apply) };
      }
      return (data as WithId).id === id ? { ...(data as T), ...patch } : data;
    });
}

/** Agrega o quita un elemento en la primera página de una lista paginada en caché. */
export function editCachedList<T extends WithId>(
  queryClient: QueryClient,
  key: unknown[],
  change: (items: T[]) => T[],
) {
  queryClient.setQueryData(key, (data: Infinite<T> | undefined) => {
    if (!data) return data;
    const [first, ...rest] = data.pages;
    return { ...data, pages: [{ ...first, items: change(first?.items ?? []) }, ...rest] };
  });
}
