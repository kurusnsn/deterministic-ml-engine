const { defineConfig } = require('checkly')

/**
 * Checkly uptime-only configuration for ChessVector.
 * Docs: https://www.checklyhq.com/docs/cli/project-structure/
 */
const config = defineConfig({
  projectName: 'ChessVector Uptime',
  logicalId: 'chessvector-uptime',
  repoUrl: 'https://github.com/kurusnsn/deterministic-ml-engine',
  checks: {
    frequency: 1,
    locations: ['eu-central-1'],
    tags: ['uptime', 'prod'],
    runtimeId: '2025.04',
    checkMatch: '**/__checks__/**/*.check.js',
  },
  cli: {
    runLocation: 'eu-central-1',
    reporters: ['list'],
    retries: 0,
  },
})

module.exports = config
