import { defineConfig } from 'vitest/config';

// Unit tests target plain (non-DI) classes, so no decorator-metadata transform is needed.
export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
  },
});
