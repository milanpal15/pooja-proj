/**
 * A titled section. `flush` removes body padding so a table can run edge to edge.
 * @typedef {Object} CardProps
 * @property {string} [title]
 * @property {React.ReactNode} [description]
 * @property {React.ReactNode} [actions]   buttons on the right of the header
 * @property {boolean} [flush]
 */
export function Card({ title, description, actions, flush = false, className = '', children, ...rest }) {
  return (
    <section className={`ui-card ${flush ? 'ui-card--flush' : ''} ${className}`.trim()} {...rest}>
      {(title || actions) && (
        <div className="ui-card__head">
          <div>
            {title && <h2 className="ui-card__title">{title}</h2>}
            {description && <p className="ui-card__desc">{description}</p>}
          </div>
          {actions && <div className="ui-card__actions">{actions}</div>}
        </div>
      )}
      {flush ? children : <div className="ui-card__body">{children}</div>}
    </section>
  );
}
