/**
 * Strip ANSI escape sequences from logs.
 */
function stripAnsi(text) {
  const ansiPattern = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;
  return text.replace(ansiPattern, '');
}

/**
 * Clean timestamp prefixes from lines.
 * GitHub Actions timestamps format: "2026-06-17T15:58:46.1234567Z line content"
 */
function stripTimestamp(line) {
  const tsPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z\s?/;
  return line.replace(tsPattern, '');
}

/**
 * Parses raw logs into structured components.
 */
function ingestLogs(rawLogs) {
  if (!rawLogs) {
    return { sections: [], errors: [], warnings: [], truncated: false, content: '' };
  }

  const cleanText = stripAnsi(rawLogs);
  const lines = cleanText.split('\n');
  
  const sections = [];
  const errors = [];
  const warnings = [];
  
  let currentSection = { name: 'Initialization', startLine: 0, lines: [] };
  
  // 1. Group into sections and identify warning/error lines
  for (let i = 0; i < lines.length; i++) {
    const originalLine = lines[i];
    const cleanLine = stripTimestamp(originalLine);
    
    // Check if line indicates a new section header
    // GitHub Actions step header pattern: "##[group]Run npm install"
    if (cleanLine.startsWith('##[group]')) {
      if (currentSection.lines.length > 0) {
        currentSection.endLine = i - 1;
        sections.push(currentSection);
      }
      currentSection = {
        name: cleanLine.replace('##[group]', '').trim(),
        startLine: i,
        lines: []
      };
      continue;
    }

    currentSection.lines.push({ index: i, content: cleanLine });

    // Detect error & warning patterns
    const upperLine = cleanLine.toUpperCase();
    if (
      upperLine.includes('ERROR') ||
      upperLine.includes('FATAL') ||
      upperLine.includes('FAIL') ||
      upperLine.includes('EXCEPTION') ||
      upperLine.includes('ERR:') ||
      cleanLine.includes('exit code') ||
      cleanLine.includes('non-zero exit status')
    ) {
      errors.push({ lineIndex: i, content: cleanLine });
    } else if (upperLine.includes('WARN') || upperLine.includes('WARNING')) {
      warnings.push({ lineIndex: i, content: cleanLine });
    }
  }
  
  // Add the final section
  currentSection.endLine = lines.length - 1;
  sections.push(currentSection);

  // 2. Extract error lines along with 5 lines of context around each
  const errorContextIndices = new Set();
  errors.forEach(err => {
    const start = Math.max(0, err.lineIndex - 5);
    const end = Math.min(lines.length - 1, err.lineIndex + 5);
    for (let idx = start; idx <= end; idx++) {
      errorContextIndices.add(idx);
    }
  });

  const sortedContextIndices = Array.from(errorContextIndices).sort((a, b) => a - b);
  
  // Build clean context blocks
  let blocks = [];
  let currentBlock = null;

  for (const idx of sortedContextIndices) {
    const cleanLine = stripTimestamp(lines[idx]);
    if (!currentBlock || idx !== currentBlock.end + 1) {
      if (currentBlock) {
        blocks.push(currentBlock);
      }
      currentBlock = { start: idx, end: idx, content: [`[Line ${idx + 1}] ${cleanLine}`] };
    } else {
      currentBlock.end = idx;
      currentBlock.content.push(`[Line ${idx + 1}] ${cleanLine}`);
    }
  }
  if (currentBlock) {
    blocks.push(currentBlock);
  }

  // 3. Compile output and limit to 8000 tokens (approx 32,000 characters)
  const MAX_CHAR_LENGTH = 32000;
  let compiledBlocksText = blocks.map(b => b.content.join('\n')).join('\n\n---\n\n');
  let truncated = false;

  if (compiledBlocksText.length > MAX_CHAR_LENGTH) {
    compiledBlocksText = compiledBlocksText.substring(0, MAX_CHAR_LENGTH) + '\n\n[TRUNCATED DUE TO SIZE LIMITS]';
    truncated = true;
  }

  return {
    sections: sections.map(s => ({ name: s.name, lineCount: s.lines.length })),
    errors: errors.map(e => ({ lineIndex: e.lineIndex, content: e.content })),
    warnings: warnings.map(w => ({ lineIndex: w.lineIndex, content: w.content })),
    errorContext: compiledBlocksText,
    truncated
  };
}

module.exports = {
  stripAnsi,
  stripTimestamp,
  ingestLogs
};
