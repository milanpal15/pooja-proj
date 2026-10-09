import { Badge } from '../../../ui/index.js';

/** Which languages a reading has text in; a language with no text is the dashed outline. */
export function LanguageTags({ row }) {
  return (
    <span className="langs">
      <Badge tone={row.prediction ? 'neutral' : 'outline'}>EN</Badge>
      <Badge tone={row.predictionHi ? 'neutral' : 'outline'}>HI</Badge>
    </span>
  );
}
