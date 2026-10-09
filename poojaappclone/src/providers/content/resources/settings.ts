export function settingNumber(settings: Record<string, string>, key: string, fallback: number) {
  const n = Number(settings[key]);
  return Number.isFinite(n) ? n : fallback;
}

export const settingText = (settings: Record<string, string>, key: string) => settings[key] ?? '';
