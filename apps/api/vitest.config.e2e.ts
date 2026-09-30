import { defineConfig } from 'vitest/config';

// E2E tests boot the compiled server (dist/) as a child process against a fake OpenAI.
export default defineConfig({
  test: {
    include: ['test/**/*.e2e.ts'],
    globalSetup: ['test/global-setup.ts'],
    // Test files share one database; run them one after another.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
