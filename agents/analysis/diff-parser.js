/**
 * Parses raw git diff text into structured JSON.
 */
function parseDiff(rawDiff) {
  if (!rawDiff) {
    return { files: [], summary: 'No changes detected.' };
  }

  const lines = rawDiff.split('\n');
  const files = [];
  let currentFile = null;
  
  let totalAdditions = 0;
  let totalDeletions = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('diff --git ')) {
      // Push previous file to list
      if (currentFile) {
        files.push(currentFile);
      }
      
      // Parse file path
      // diff --git a/path/to/file b/path/to/file
      const match = line.match(/b\/(.+)$/);
      const filePath = match ? match[1] : 'unknown';

      currentFile = {
        path: filePath,
        additions: 0,
        deletions: 0,
        isNew: false,
        isDeleted: false,
        newFunctions: []
      };
      continue;
    }

    if (!currentFile) continue;

    if (line.startsWith('new file mode ')) {
      currentFile.isNew = true;
      continue;
    }

    if (line.startsWith('deleted file mode ')) {
      currentFile.isDeleted = true;
      continue;
    }

    // Process diff hunks
    if (line.startsWith('+') && !line.startsWith('+++ ')) {
      currentFile.additions++;
      totalAdditions++;

      // Detect new function definitions
      const cleanAddedLine = line.substring(1).trim();
      const fnPatterns = [
        /(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/i, // const foo = () =>
        /(?:async\s*)?function\s+(\w+)\s*\(/i,                         // async function foo()
        /class\s+(\w+)/i,                                              // class Foo
        /def\s+(\w+)\s*\(/i,                                           // def foo()
        /public|private|protected\s+(?:async\s+)?(?:\w+\s+)?(\w+)\s*\(/i // java/c# methods
      ];

      for (const pattern of fnPatterns) {
        const match = cleanAddedLine.match(pattern);
        if (match && match[1]) {
          currentFile.newFunctions.push(match[1]);
          break;
        }
      }
    } else if (line.startsWith('-') && !line.startsWith('--- ')) {
      currentFile.deletions++;
      totalDeletions++;
    }
  }

  // Push final file
  if (currentFile) {
    files.push(currentFile);
  }

  // Generate summary string
  const summary = `Modified ${files.length} file(s) with ${totalAdditions} addition(s) and ${totalDeletions} deletion(s).`;

  return {
    files,
    summary,
    totalAdditions,
    totalDeletions
  };
}

module.exports = {
  parseDiff
};
