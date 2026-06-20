const anthropic = require('../../config/anthropic');
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');

/**
 * Generates a hotfix patch using Claude and opens a GitHub Pull Request with the fix.
 * 
 * @param {Object} params
 * @param {string} params.owner - GitHub Repository Owner
 * @param {string} params.repo - GitHub Repository Name
 * @param {string} params.filePath - Relative path to the failing file
 * @param {number} params.line - Line number of the error
 * @param {string} params.errorMessage - Error message / log context
 * @returns {Object} PR URL and details
 */
async function suggestHotfix({ owner, repo, filePath, line, errorMessage }) {
  // 1. Read the failing code context
  let fileContent = '';
  try {
    const fullPath = path.resolve(__dirname, '../..', filePath);
    fileContent = await fs.readFile(fullPath, 'utf8');
  } catch (err) {
    // Fallback if file not found locally
    fileContent = `// Failing file context at ${filePath}\n// Error: ${errorMessage}`;
  }

  // 2. Query Claude to generate hotfix patch
  const systemPrompt = `You are PipelineDoc Hotfix Suggester.
Given the file path, code content, line number, and error message, you must suggest a minimal drop-in patch to fix the error.
Respond in JSON format ONLY:
{
  "title": "Short title of the fix",
  "explanation": "Brief description of why this fixes the issue",
  "original": "Exact code block from the file to be replaced",
  "replacement": "Code block to replace it with",
  "verification_steps": "How a developer can verify this fix locally"
}`;

  const userContent = `
File Path: ${filePath}
Line Number: ${line}
Error Message: ${errorMessage}

--- CODE CONTENT ---
${fileContent}
`;

  let suggestion;
  try {
    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }]
    });
    suggestion = JSON.parse(response.content[0].text);
  } catch (err) {
    console.error('Claude API call failed in hotfix-suggester:', err.message);
    // Return a default suggestion if API fails or returns invalid JSON
    suggestion = {
      title: 'Fix error in ' + filePath,
      explanation: 'Claude suggestHotfix API fallback.',
      original: '',
      replacement: '',
      verification_steps: 'Run tests'
    };
  }

  // 3. Apply the patch to the content
  let updatedContent = fileContent;
  if (suggestion.original && fileContent.includes(suggestion.original)) {
    updatedContent = fileContent.replace(suggestion.original, suggestion.replacement);
  }

  // 4. Open GitHub PR (or mock it in tests/development)
  const prTitle = `[PipelineDoc Hotfix] ${suggestion.title}`;
  const prBody = `## 🩺 PipelineDoc Automated Hotfix

### 🚨 Diagnosis & Error
* **Error Message:** \`${errorMessage}\`
* **File:** \`${filePath}\` (Line: ${line})

### 💡 Suggested Patch
* **Explanation:** ${suggestion.explanation}
* **Original Code:**
\`\`\`javascript
${suggestion.original || '// Not specified'}
\`\`\`
* **Fixed Code:**
\`\`\`javascript
${suggestion.replacement || '// Not specified'}
\`\`\`

### 🧪 Local Verification
${suggestion.verification_steps}

*Note: This PR was automatically opened by the PipelineDoc Auto-Healer and requires human review before merging.*`;

  let prUrl = 'https://github.com/mock/repo/pull/1';
  let branchName = `pipelinedoc-hotfix-${Date.now()}`;

  if (process.env.NODE_ENV !== 'production') {
    console.log(`[Mock GitHub PR]: Opening PR "${prTitle}" on branch "${branchName}"`);
    return {
      success: true,
      prUrl,
      prTitle,
      branchName,
      suggestion
    };
  }

  try {
    const client = axios.create({
      baseURL: 'https://api.github.com',
      headers: {
        Accept: 'application/vnd.github.v3+json',
        Authorization: `token ${process.env.GITHUB_TOKEN}`,
        'User-Agent': 'PipelineDoc-Agent'
      }
    });

    // A. Get main branch SHA
    const baseRefRes = await client.get(`/repos/${owner}/${repo}/git/ref/heads/main`);
    const mainSha = baseRefRes.data.object.sha;

    // B. Create a new branch
    await client.post(`/repos/${owner}/${repo}/git/refs`, {
      ref: `refs/heads/${branchName}`,
      sha: mainSha
    });

    // C. Get the file SHA on the new branch
    const fileRes = await client.get(`/repos/${owner}/${repo}/contents/${filePath}?ref=${branchName}`);
    const fileSha = fileRes.data.sha;

    // D. Update file content
    await client.put(`/repos/${owner}/${repo}/contents/${filePath}`, {
      message: `fix: auto-hotfix for error on line ${line}`,
      content: Buffer.from(updatedContent).toString('base64'),
      sha: fileSha,
      branch: branchName
    });

    // E. Create the PR
    const prRes = await client.post(`/repos/${owner}/${repo}/pulls`, {
      title: prTitle,
      body: prBody,
      head: branchName,
      base: 'main'
    });

    prUrl = prRes.data.html_url;

    return {
      success: true,
      prUrl,
      prTitle,
      branchName,
      suggestion
    };
  } catch (err) {
    console.error('Failed to open GitHub Pull Request:', err.message);
    throw err;
  }
}

module.exports = {
  suggestHotfix
};
