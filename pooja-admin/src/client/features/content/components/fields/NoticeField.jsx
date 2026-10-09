import { Banner } from '../../../../ui/index.js';

/** A note inside a form (draws no input, stores nothing). */
export function NoticeField({ field }) {
  return <Banner tone="warning">{field.text}</Banner>;
}
