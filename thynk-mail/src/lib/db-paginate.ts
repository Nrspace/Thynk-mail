// Shared helpers for working around two PostgREST/Supabase defaults that
// silently truncate results if you're not careful:
//
//  1. Any .select() is capped at 1000 rows (db.max_rows) unless you page
//     through it with .range(). fetchAllRows() pages until a page comes
//     back shorter than PAGE_SIZE (i.e. we've reached the end).
//
//  2. .in(column, values) is sent as a query string
//     (?id=in.(uuid1,uuid2,...)). With thousands of ids that URL can exceed
//     the server/proxy's max URL length and the request fails outright.
//     runInChunks() runs the same operation in batches of DB_IN_CHUNK_SIZE
//     ids at a time so that never happens, at the cost of a few extra
//     sequential round trips.

export const PAGE_SIZE = 1000;
export const DB_IN_CHUNK_SIZE = 300;

export async function fetchAllRows<T>(
  query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await query(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message ?? String(error));
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return all;
}

export async function runInChunks<T, R>(
  items: T[],
  size: number,
  fn: (chunk: T[]) => Promise<R[]>
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    const chunk = items.slice(i, i + size);
    results.push(...(await fn(chunk)));
  }
  return results;
}
