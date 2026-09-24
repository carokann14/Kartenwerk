import React from 'react';
import { createRoot } from 'react-dom/client';
import sans400 from '@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff2?url';
import sans500 from '@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-500-normal.woff2?url';
import sans600 from '@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-600-normal.woff2?url';
import mono400 from '@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2?url';
import mono500 from '@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2?url';
import mono600 from '@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-600-normal.woff2?url';
import { App } from './App';
import './styles.css';

// Oberflächenschrift lokal ausliefern, ohne Anfragen an Dritte
for (const [family, weight, url] of [['IBM Plex Sans', '400', sans400], ['IBM Plex Sans', '500', sans500], ['IBM Plex Sans', '600', sans600], ['IBM Plex Mono', '400', mono400], ['IBM Plex Mono', '500', mono500], ['IBM Plex Mono', '600', mono600]]) {
  try { const f = new FontFace(family, `url(${url}) format("woff2")`, { weight, display: 'swap' }); document.fonts.add(f); f.load().catch(() => undefined); } catch { /* Systemschrift */ }
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
