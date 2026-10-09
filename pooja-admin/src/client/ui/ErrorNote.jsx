/**
 * Page-level "API unreachable" block for the poll-driven tabs (Overview, Flags,
 * Coin Orders, Visitors). Kit-styled; the kit's ErrorState is the in-card variant.
 */
export function ErrorNote({ msg }) {
  return (
    <div className="ui-errnote" role="alert">
      <b>Can't reach the API.</b> {msg}
      <div className="ui-errnote__hint">
        Start the backend: <code>cd pooja-api &amp;&amp; npm run dev</code>
      </div>
    </div>
  );
}
