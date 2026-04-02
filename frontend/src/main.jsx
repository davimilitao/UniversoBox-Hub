/**
 * @file main.jsx
 * @module app
 * @description Entrada do SPA React (UniversoBox Hub).
 * @version 1.0.0
 * @date 2026-03-31
 * @author UniversoLab
 *
 * @changelog
 *   1.0.0 — 2026-03-31 — Criação inicial com React Router.
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter basename="/spa">
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
