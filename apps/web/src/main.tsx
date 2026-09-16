import React from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';

const container = document.getElementById('root')!;

const tree = (
  <React.StrictMode>
    <BrowserRouter basename="/siders">
      <App />
    </BrowserRouter>
  </React.StrictMode>
);

// The anak usaha routes ship with their markup already in the HTML (`scripts/prerender.mjs`), so
// those adopt it instead of throwing it away and repainting. Every other route is served the empty
// `index.html` shell, where `hydrateRoot` has nothing to adopt and only `createRoot` is valid.
if (container.firstChild) {
  hydrateRoot(container, tree);
} else {
  createRoot(container).render(tree);
}
