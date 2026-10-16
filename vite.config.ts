import { defineConfig } from 'vite';

export default defineConfig(({ command, isPreview }) => ({
  // GitHub project Pages is served under the repository name.
  base: command === 'build' || isPreview ? '/ring-breaker/' : '/',
}));
