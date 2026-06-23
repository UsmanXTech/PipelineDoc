const axios = require('axios');

const OSV_API_URL = 'https://api.osv.dev/v1/query';

/**
 * Extracts newly added or updated packages from a package.json or requirements.txt diff.
 */
function extractNewDependencies(rawDiff) {
  const packages = [];
  const lines = rawDiff.split('\n');
  let currentFile = 'unknown';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('diff --git ')) {
      const match = line.match(/b\/(.+)$/);
      currentFile = match ? match[1] : 'unknown';
      continue;
    }

    // Parse additions
    if (line.startsWith('+') && !line.startsWith('+++ ')) {
      const cleanLine = line.substring(1).trim();

      // NPM package.json: "package-name": "^1.2.3"
      if (currentFile.endsWith('package.json')) {
        const npmMatch = cleanLine.match(/"([^"]+)"\s*:\s*"([^"]+)"/);
        if (npmMatch) {
          const name = npmMatch[1];
          // Strip semver operators (^, ~, etc) to get a clean querying version
          const version = npmMatch[2].replace(/[\^~>=<]/g, '').split(' ')[0];
          // Skip metadata keys or devDependencies dependencies section name
          if (name !== 'dependencies' && name !== 'devDependencies' && name !== 'scripts') {
            packages.push({ name, version, ecosystem: 'npm' });
          }
        }
      }

      // Python requirements.txt: package-name==1.2.3
      if (currentFile.endsWith('requirements.txt')) {
        const pythonMatch = cleanLine.match(/^([a-zA-Z0-9_\-]+)==([0-9\.]+)/);
        if (pythonMatch) {
          packages.push({ name: pythonMatch[1], version: pythonMatch[2], ecosystem: 'PyPI' });
        }
      }
    }
  }

  return packages;
}

/**
 * Scans dependencies for known vulnerabilities using the OSV.dev API.
 */
async function scanDependencies(rawDiff) {
  const vulnerabilities = [];
  const packages = extractNewDependencies(rawDiff);

  for (const pkg of packages) {
    try {
      const response = await axios.post(OSV_API_URL, {
        package: {
          name: pkg.name,
          ecosystem: pkg.ecosystem
        },
        version: pkg.version
      });

      // OSV returns { } or { vulns: [] }
      if (response.data && response.data.vulns) {
        for (const vuln of response.data.vulns) {
          // Extract CVE ID
          const cveId = vuln.aliases && vuln.aliases.length > 0 ? vuln.aliases[0] : vuln.id;
          
          // Determine Severity
          let severity = 'UNKNOWN';
          if (vuln.database_specific && vuln.database_specific.severity) {
            severity = vuln.database_specific.severity;
          } else if (vuln.severity && vuln.severity[0]) {
            severity = vuln.severity[0].type || 'UNKNOWN';
          }

          // Determine Fix Version
          let fixVersion = 'unknown';
          if (vuln.affected && vuln.affected[0] && vuln.affected[0].ranges) {
            for (const range of vuln.affected[0].ranges) {
              if (range.events) {
                const fixedEvent = range.events.find(e => e.fixed);
                if (fixedEvent) {
                  fixVersion = fixedEvent.fixed;
                  break;
                }
              }
            }
          }

          vulnerabilities.push({
            package: pkg.name,
            version: pkg.version,
            severity,
            cve_id: cveId,
            fix_version: fixVersion,
            summary: vuln.summary || vuln.details || 'No details available.'
          });
        }
      }
    } catch (error) {
      console.error(`OSV.dev API scan failed for ${pkg.name}@${pkg.version}:`, error.message);
    }
  }

  return {
    packagesScanned: packages.length,
    vulnerabilities
  };
}

module.exports = {
  extractNewDependencies,
  scanDependencies
};
