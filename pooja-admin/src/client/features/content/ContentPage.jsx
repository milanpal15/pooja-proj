import { api } from '../../lib/api/index.js';
import { ContentManager } from './ContentManager.jsx';

/**
 * Turn a resource config ({ title, resource, fields, previewKey, rowAction })
 * into a tab page. Called once per tab at module load, so each page keeps a
 * stable component identity across renders. `area` arrives from the tab
 * registry (the config never names its own).
 */
export const contentPage = (cfg) =>
  function ContentPage({ area }) {
    return (
      <ContentManager
        title={cfg.title}
        resource={api[cfg.resource]}
        fields={cfg.fields}
        previewKey={cfg.previewKey}
        rowAction={cfg.rowAction}
        area={area}
      />
    );
  };
