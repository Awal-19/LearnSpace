import '@fontsource-variable/inter';
import '@fontsource/poppins/500.css';
import '@fontsource/poppins/600.css';
import '@fontsource/poppins/700.css';
import 'katex/dist/katex.min.css';
import 'highlight.js/styles/github-dark.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import './index.css';
import { ErrorBoundary } from './app/ErrorBoundary';
import { Providers } from './app/Providers';
import { createAppRouter } from './app/router';

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root not found');

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary>
      <Providers>
        <RouterProvider router={createAppRouter()} />
      </Providers>
    </ErrorBoundary>
  </StrictMode>,
);
