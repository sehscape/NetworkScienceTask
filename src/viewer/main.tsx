import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { initLiquidGlass } from '../design/liquid-glass.js';
import { PolicyViewer } from './PolicyViewer';
import '../styles/global.css';
import '../styles/policy.css';

initLiquidGlass();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PolicyViewer />
  </StrictMode>,
);
