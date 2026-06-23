/**
 * Detects potential breaking changes by scanning git diff lines.
 */
function detectBreakingChanges(rawDiff) {
  const changes = [];
  
  if (!rawDiff) {
    return { has_breaking_changes: false, changes };
  }

  const lines = rawDiff.split('\n');
  let currentFile = 'unknown';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Track current file path
    if (line.startsWith('diff --git ')) {
      const match = line.match(/b\/(.+)$/);
      currentFile = match ? match[1] : 'unknown';
      continue;
    }

    // Only inspect deletions (lines starting with '-' and not '--- ')
    if (line.startsWith('-') && !line.startsWith('--- ')) {
      const cleanLine = line.substring(1).trim();
      const upperLine = cleanLine.toUpperCase();

      // 1. DB schema columns dropped or renamed
      if (currentFile.endsWith('.sql') || currentFile.includes('migration') || currentFile.includes('schema')) {
        if (
          upperLine.includes('DROP COLUMN') ||
          upperLine.includes('DROP TABLE') ||
          upperLine.includes('RENAME COLUMN') ||
          upperLine.includes('RENAME TO') ||
          upperLine.includes('ALTER TABLE') && upperLine.includes('DROP')
        ) {
          changes.push({
            type: 'db_breaking_change',
            description: `Potential database column/table drop or rename detected: "${cleanLine}"`,
            file: currentFile
          });
        }
      }

      // 2. REST API routes removed
      if (currentFile.includes('routes/') || currentFile.includes('api/')) {
        if (
          cleanLine.includes('router.get(') ||
          cleanLine.includes('router.post(') ||
          cleanLine.includes('router.put(') ||
          cleanLine.includes('router.delete(') ||
          cleanLine.includes('router.patch(') ||
          cleanLine.includes('app.get(') ||
          cleanLine.includes('app.post(')
        ) {
          changes.push({
            type: 'api_breaking_change',
            description: `Potential API route removal detected: "${cleanLine}"`,
            file: currentFile
          });
        }
      }

      // 3. Environment variable names changed/removed in config or env files
      if (currentFile.includes('.env') || currentFile.includes('config/')) {
        const envMatch = cleanLine.match(/^([A-Z0-9_]+)\s*=/);
        if (envMatch) {
          changes.push({
            type: 'env_breaking_change',
            description: `Potential environment variable removal/modification: "${envMatch[1]}"`,
            file: currentFile
          });
        }
      }

      // 4. Exported function/class removed (CommonJS & ES Modules)
      if (currentFile.endsWith('.js') || currentFile.endsWith('.ts')) {
        if (
          cleanLine.startsWith('export const') ||
          cleanLine.startsWith('export function') ||
          cleanLine.startsWith('export default') ||
          cleanLine.startsWith('export class') ||
          cleanLine.includes('module.exports') && !cleanLine.includes('require')
        ) {
          changes.push({
            type: 'code_breaking_change',
            description: `Potential export signature removal or modification: "${cleanLine}"`,
            file: currentFile
          });
        }
      }
    }
  }

  return {
    has_breaking_changes: changes.length > 0,
    changes
  };
}

module.exports = {
  detectBreakingChanges
};
