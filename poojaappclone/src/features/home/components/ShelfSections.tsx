import { useShelfSections } from '../hooks/use-shelf-sections';
import { CustomShelf } from './CustomShelf';
import { KnowledgeShelf } from './KnowledgeShelf';

/** The dashboard's shelves (Pitru Paksha, Books, Knowledge, Ancestors) — nothing when it has none. */
export function ShelfSections({ hi }: { hi: boolean }) {
  const sections = useShelfSections();
  return (
    <>
      {sections.map((s) =>
        s.source === 'knowledge' ? (
          <KnowledgeShelf key={s.key} section={s} hi={hi} />
        ) : (
          <CustomShelf key={s.key} section={s} hi={hi} />
        ),
      )}
    </>
  );
}
