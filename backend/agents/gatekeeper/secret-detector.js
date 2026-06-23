/**
 * Scans git diff for hardcoded secrets, keys, and credentials.
 */
function scanSecrets(rawDiff) {
  const findings = [];
  
  if (!rawDiff) {
    return { secrets_found: false, findings };
  }

  const lines = rawDiff.split('\n');
  let currentFile = 'unknown';
  let hunkLineNumber = 0;

  // Regex secret patterns
  const rules = [
    {
      name: 'GitHub Token',
      regex: /(?:ghp_|github_pat_)[a-zA-Z0-9_]{36,100}/
    },
    {
      name: 'Anthropic/OpenAI API Key',
      regex: /(?:sk-ant-|sk-proj-|sk-)[a-zA-Z0-9_-]{20,100}/
    },
    {
      name: 'Google API Key',
      regex: /AIza[0-9A-Za-z-_]{35}/
    },
    {
      name: 'AWS Access Key ID',
      regex: /AKIA[0-9A-Z]{16}/
    },
    {
      name: 'Password/Secret Assignment',
      regex: /(?:password|passwd|pwd|secret|client_secret|jwt_secret|api_key|apikey|private_key)\s*[:=]\s*['"`][a-zA-Z0-9_\-\.\!\@\#\$\%\^\&\*\(\)\+]{4,}['"`]/i
    },
    {
      name: 'Generic High-Entropy String / Base64 Token',
      regex: /(?:'|")[A-Za-z0-9+/]{40,}(?:=){0,2}(?:'|")/
    }
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Track file name
    if (line.startsWith('diff --git ')) {
      const match = line.match(/b\/(.+)$/);
      currentFile = match ? match[1] : 'unknown';
      continue;
    }

    // Parse hunk start to track lines
    if (line.startsWith('@@ ')) {
      const match = line.match(/\+([0-9]+)/);
      if (match) {
        hunkLineNumber = parseInt(match[1], 10) - 1;
      }
      continue;
    }

    // Only scan added lines
    if (line.startsWith('+') && !line.startsWith('+++ ')) {
      hunkLineNumber++;
      const cleanLine = line.substring(1).trim();

      // Skip comment lines or empty lines
      if (cleanLine.startsWith('//') || cleanLine.startsWith('#') || cleanLine.startsWith('/*') || !cleanLine) {
        continue;
      }

      // Check each rule
      for (const rule of rules) {
        if (rule.regex.test(cleanLine)) {
          // Exclude tests or dummy configurations where fake secrets are expected
          if (
            currentFile.includes('test') || 
            currentFile.includes('spec') || 
            cleanLine.includes('dummy') || 
            cleanLine.includes('placeholder') ||
            cleanLine.includes('your_') ||
            cleanLine.includes('example')
          ) {
            continue;
          }

          findings.push({
            file: currentFile,
            line: hunkLineNumber,
            pattern_type: rule.name,
            snippet: cleanLine.length > 50 ? cleanLine.substring(0, 50) + '...' : cleanLine
          });
          break;
        }
      }
    } else if (!line.startsWith('-')) {
      // Unchanged lines increment line counter
      hunkLineNumber++;
    }
  }

  return {
    secrets_found: findings.length > 0,
    findings
  };
}

module.exports = {
  scanSecrets
};
