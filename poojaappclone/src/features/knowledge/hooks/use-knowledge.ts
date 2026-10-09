import { useMemo, useState } from 'react';

import { useContent } from '@/providers/content';

/** The selected deity and its lore, normalised so each section can be a plain map. */
export function useKnowledge(param: string | undefined) {
  const { deityArt, deityById, deityList, knowledge } = useContent();

  /*
   * The lore is the dashboard's, keyed by deity slug. It used to be a 200
   * line literal in constants/knowledge.ts, which the Knowledge tab could
   * not touch — so the one copy an operator could edit was the one nobody
   * ever read.
   */
  const loreBySlug = useMemo(
    () => Object.fromEntries(knowledge.map((k) => [k.deitySlug, k])),
    [knowledge],
  );
  // Only deities that actually have lore published get a chip.
  const knowledgeIds = useMemo(
    () => deityList.map((d) => d.id).filter((slug) => loreBySlug[slug]),
    [deityList, loreBySlug],
  );

  const [id, setId] = useState(() =>
    knowledgeIds.includes(param as string) ? (param as string) : (knowledgeIds[0] ?? ''),
  );

  const deity = deityById(id);
  /*
   * Dashboard rows may leave any section blank, which the bundled literal
   * never did. Normalising here keeps each section below a plain map, and
   * an empty array renders an empty band rather than crashing.
   */
  const entry = loreBySlug[id];
  const lore = entry && {
    ...entry,
    facts: entry.facts ?? [],
    texts: entry.texts ?? [],
    textsHi: entry.textsHi ?? entry.texts ?? [],
    festivals: entry.festivals ?? [],
    festivalsHi: entry.festivalsHi ?? entry.festivals ?? [],
  };
  const art = deityArt(id);

  return { id, setId, deity, lore, art, deityList, knowledgeIds };
}

export type Lore = NonNullable<ReturnType<typeof useKnowledge>['lore']>;
