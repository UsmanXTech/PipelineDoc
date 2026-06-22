#!/usr/bin/env node

/**
 * PipelineDoc CLI Client (pd)
 * Zero-dependency helper for integrating self-healing checks into any CI/CD pipeline.
 */

const fs = require('fs');
const path = require('path');

// Load .env if present in current directory
try {
  const envPath = path.join(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let value = match[2] || '';
        if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
        if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    });
  }
} catch (e) {
  // Silent fallback if .env is unreadable
}

const API_URL = process.env.PIPELINEDOC_API_URL || 'http://localhost:3000';
const API_KEY = process.env.PIPELINEDOC_API_KEY || 'dummy-api-key';

function printUsage() {
  console.log(`
PipelineDoc CLI Client (pd)
Usage: node pd.js <command> [options]

Commands:
  gate           Evaluate a pull request/code diff against Gatekeeper risk policies
  deploy-start   Register the start of a deployment session
  deploy-finish  Report the conclusion of a deployment (triggers RCA on failure)
  rca            Trigger direct root-cause failure diagnostics

Configuration:
  Set environment variables or write to a local .env file:
    PIPELINEDOC_API_URL  (Default: http://localhost:3000)
    PIPELINEDOC_API_KEY  (Authorization header token)

Examples:
  node pd.js gate --repo payment-service --diff-file ./git.diff
  node pd.js deploy-start --repo payment-service --branch main --strategy canary
  node pd.js deploy-finish --deploy-id <uuid> --status failure --logs-file ./error.log
  node pd.js rca --logs-file ./error.log --repo payment-service
  `);
}

// Simple argv parser
function parseArgs(args) {
  const options = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].substring(2).replace(/-([a-z])/g, g => g[1].toUpperCase());
      const val = args[i + 1];
      if (val && !val.startsWith('--')) {
        options[key] = val;
        i++;
      } else {
        options[key] = true;
      }
    }
  }
  return options;
}

async function request(endpoint, method, body = null) {
  const url = `${API_URL.replace(/\/$/, '')}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': API_KEY
  };

  try {
    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : null
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || `HTTP error ${res.status}`);
    }
    return data;
  } catch (err) {
    console.error(`\x1b[31mAPI Error: ${err.message}\x1b[0m`);
    process.exit(1);
  }
}

async function run() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    printUsage();
    process.exit(0);
  }

  const options = parseArgs(args.slice(1));

  switch (command) {
    case 'gate': {
      const { repo, diffFile, authorEmail } = options;
      if (!repo || !diffFile) {
        console.error('\x1b[31mError: Missing required flags: --repo and --diff-file\x1b[0m');
        process.exit(1);
      }

      if (!fs.existsSync(diffFile)) {
        console.error(`\x1b[31mError: Diff file not found: ${diffFile}\x1b[0m`);
        process.exit(1);
      }

      const rawDiff = fs.readFileSync(diffFile, 'utf8');
      console.log(`Submitting Gatekeeper evaluation for repository: ${repo}...`);

      const result = await request('/api/analysis/gate', 'POST', {
        rawDiff,
        authorEmail: authorEmail || 'ci-runner@example.com'
      });

      const decisionUpper = (result.decision || 'PASS').toUpperCase();
      console.log('\n--- GATEKEEPER ANALYSIS REPORT ---');
      console.log(`Decision:   ${decisionUpper === 'BLOCK' ? '\x1b[31mBLOCKED\x1b[0m' : (decisionUpper === 'WARN' ? '\x1b[33mWARNING\x1b[0m' : '\x1b[32mAPPROVED\x1b[0m')}`);
      console.log(`Risk Score: ${result.risk_score}/100`);
      console.log(`Rationale:  ${result.reason}`);
      console.log('---------------------------------\n');

      if (decisionUpper === 'BLOCK') {
        process.exit(1); // Block deployment
      }
      break;
    }

    case 'deploy-start': {
      const { repo, branch, commitSha, strategy } = options;
      if (!repo || !branch) {
        console.error('\x1b[31mError: Missing required flags: --repo and --branch\x1b[0m');
        process.exit(1);
      }

      console.log(`Registering deployment start for ${repo}/${branch}...`);
      const result = await request('/api/deployments', 'POST', {
        repo,
        branch,
        commit_sha: commitSha,
        strategy: strategy || 'rolling'
      });

      console.log(`\n\x1b[32mSuccess: Deployment Registered.\x1b[0m`);
      console.log(`Deployment Run ID: \x1b[36m${result.deploymentId}\x1b[0m`);
      console.log(`Selected Strategy: ${result.strategy}\n`);
      break;
    }

    case 'deploy-finish': {
      const { deployId, status, logsFile } = options;
      if (!deployId || !status) {
        console.error('\x1b[31mError: Missing required flags: --deploy-id and --status\x1b[0m');
        process.exit(1);
      }

      let logMessage = null;
      if (logsFile && fs.existsSync(logsFile)) {
        logMessage = fs.readFileSync(logsFile, 'utf8').substring(0, 5000); // cap size
      }

      console.log(`Reporting deployment conclusion status (${status}) for ID: ${deployId}...`);
      const result = await request(`/api/deployments/${deployId}`, 'PATCH', {
        status,
        current_stage: status === 'success' ? 'Completed' : 'Failed',
        log_message: logMessage
      });

      console.log(`\n\x1b[32mStatus updated successfully.\x1b[0m`);
      if (status === 'failure') {
        console.log(`RCA Doctor analysis triggered in the background for this failure run.\n`);
      }
      break;
    }

    case 'rca': {
      const { logsFile, diffFile, commitMessage, repo, commitSha } = options;
      if (!logsFile) {
        console.error('\x1b[31mError: Missing required flag: --logs-file\x1b[0m');
        process.exit(1);
      }

      if (!fs.existsSync(logsFile)) {
        console.error(`\x1b[31mError: Logs file not found: ${logsFile}\x1b[0m`);
        process.exit(1);
      }

      const logs = fs.readFileSync(logsFile, 'utf8');
      const diff = diffFile && fs.existsSync(diffFile) ? fs.readFileSync(diffFile, 'utf8') : '';

      console.log(`Uploading failure telemetry and running RCA Failure Doctor...`);
      const result = await request('/api/analysis/rca', 'POST', {
        logs,
        diff,
        commitMessage: commitMessage || 'CI/CD runner diagnostic execution',
        repo,
        commitSha
      });

      console.log('\n--- ROOT CAUSE ANALYSIS (RCA) ---');
      console.log(`Anomaly Category:  \x1b[33m${result.failure_type}\x1b[0m`);
      console.log(`Confidence:        ${result.confidence}%`);
      console.log(`Affected File:     ${result.affected_file || 'n/a'}`);
      console.log(`\nDiagnosis:`);
      console.log(`\x1b[36m${result.root_cause}\x1b[0m`);
      console.log(`\nAI Remediation:`);
      console.log(`\x1b[32m${result.suggested_fix}\x1b[0m`);
      if (result.blame) {
        console.log(`\nBlame Attribution:`);
        console.log(`  Triggered By:  ${result.blame.author_name} (${result.blame.author_email})`);
        console.log(`  Attribution Confidence: ${result.blame.confidence}%`);
      }
      console.log('---------------------------------\n');
      break;
    }

    default:
      console.error(`Unknown command: ${command}`);
      printUsage();
      process.exit(1);
  }
}

run();
