/** Where Home's search goes: the Search screen, carrying whatever was typed. */
export function searchPath(query: string): string {
  const q = query.trim();
  return q ? `/search?q=${encodeURIComponent(q)}` : '/search';
}
