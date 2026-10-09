/** Fill `{name}` placeholders in an i18n string: `fill(t('astro_rate'), { n: 20 })`. */
export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}
