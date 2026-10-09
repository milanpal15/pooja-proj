/** The first word of the devotee's name, for "Jai Shri Ram, <name>". '' when there is none. */
export function firstName(name: string | null | undefined): string {
  return (name ?? '').trim().split(/\s+/)[0] ?? '';
}

/** One glyph for the avatar: the name's first letter, or ॐ for an unnamed devotee. */
export function avatarInitial(name: string | null | undefined): string {
  const first = firstName(name);
  return first ? Array.from(first)[0].toUpperCase() : 'ॐ';
}
