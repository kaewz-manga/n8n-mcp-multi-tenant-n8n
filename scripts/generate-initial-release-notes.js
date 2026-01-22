#!/usr/bin/env node

/**
 * Generate release notes for the initial release
 * Used by GitHub Actions when no previous tag exists
 */

const { execSync } = require('child_process');

function generateInitialReleaseNotes(version) {
  try {
    // Get total commit count
    const commitCount = execSync('git rev-list --count HEAD', { encoding: 'utf8' }).trim();

    // Generate release notes
    const releaseNotes = [
      '### 🎉 Initial Release',
      '',
      `This is the initial release of n8n-mcp v${version}.`,
      '',
      '---',
      '',
      '**Release Statistics:**',
      `- Commit count: ${commitCount}`,
      '- First release setup'
    ];

    return releaseNotes.join('\n');

  } catch (error) {
    console.error(`Error generating initial release notes: ${error.message}`);
    return `Failed to generate initial release notes: ${error.message}`;
  }
}

// Parse command line arguments
const version = process.argv[2];

if (!version) {
  console.error('Usage: generate-initial-release-notes.js <version>');
  process.exit(1);
}

const releaseNotes = generateInitialReleaseNotes(version);
console.log(releaseNotes);
