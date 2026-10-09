/**
 * The scroll box + base table styles. Wide tables scroll inside their own box
 * (usable at 390px) rather than pushing the page sideways. Put your own
 * <thead>/<tbody> inside; use `className="num"` on right-aligned numeric cells.
 *
 * @typedef {Object} DataTableProps
 * @property {string} label       accessible name of the table
 * @property {number} [minWidth=720]
 * @property {string} [className]  extra class on the <table> (a feature's cell rules)
 */
export function DataTable({ label, minWidth = 720, className = '', children }) {
  return (
    <div className="ui-table-scroll">
      <table className={`ui-table ${className}`.trim()} aria-label={label} style={{ minWidth }}>
        {children}
      </table>
    </div>
  );
}
