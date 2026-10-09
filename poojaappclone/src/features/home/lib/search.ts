/** Where the Home search box goes: the pooja list, pre-filtered when something was typed. */
export function searchPath(query: string): string {
  const q = query.trim();
  return q ? `/poojas?q=${encodeURIComponent(q)}` : '/poojas';
}
