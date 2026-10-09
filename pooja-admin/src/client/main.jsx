import React from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './app/App.jsx';
import { Providers } from './app/providers.jsx';
import './styles.css';
import './styles/tokens.css';
import './styles/ui.css';
import './styles/shell.css';
import './styles/features.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Providers>
      <App />
    </Providers>
  </React.StrictMode>,
);
