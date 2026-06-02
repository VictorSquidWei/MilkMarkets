/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `base` matters for GitHub Pages project sites: set VITE_BASE='/<repo>/' at build time.
// Defaults to '/' for local dev / user-org pages / custom domains.
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
