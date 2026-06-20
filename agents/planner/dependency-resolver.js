const fs = require('fs');
const path = require('path');

// Default service dependencies structure if config/services.json is missing
const DEFAULT_SERVICE_DEPENDENCIES = {
  'auth-service': [],
  'payment-service': ['auth-service'],
  'notification-service': ['auth-service'],
  'frontend-app': ['payment-service', 'notification-service']
};

/**
 * Topologically sorts services so dependencies deploy before dependents.
 * 
 * @param {Array<string>} servicesToDeploy - List of services needing deployment. If empty, sorts all services.
 * @returns {Object} `{ deploy_order: string[], dependency_graph: Object }`
 */
function resolveDependencies(servicesToDeploy = []) {
  // 1. Read config/services.json if it exists
  let graph = { ...DEFAULT_SERVICE_DEPENDENCIES };
  const configPath = path.join(__dirname, '../../config/services.json');

  if (fs.existsSync(configPath)) {
    try {
      const fileData = fs.readFileSync(configPath, 'utf8');
      graph = JSON.parse(fileData);
    } catch (err) {
      console.warn('Failed to parse config/services.json, using default dependencies:', err.message);
    }
  }

  // 2. Identify the active subset of services we want to sort
  const targetServices = new Set(
    servicesToDeploy.length > 0 
      ? servicesToDeploy 
      : Object.keys(graph)
  );

  // Build local dependency graph tracking in-degrees
  const adjList = {};
  const inDegree = {};

  for (const node of targetServices) {
    adjList[node] = [];
    inDegree[node] = 0;
  }

  for (const node of targetServices) {
    const deps = graph[node] || [];
    for (const dep of deps) {
      if (targetServices.has(dep)) {
        adjList[dep].push(node);
        inDegree[node]++;
      }
    }
  }

  // 3. Queue nodes with 0 in-degree
  const queue = [];
  for (const node of targetServices) {
    if (inDegree[node] === 0) {
      queue.push(node);
    }
  }

  const deploy_order = [];
  while (queue.length > 0) {
    // Sort to maintain deterministic alphabetical ordering for equal priorities
    queue.sort();
    const u = queue.shift();
    deploy_order.push(u);

    for (const v of adjList[u]) {
      inDegree[v]--;
      if (inDegree[v] === 0) {
        queue.push(v);
      }
    }
  }

  // Cycle check
  if (deploy_order.length !== targetServices.size) {
    throw new Error('Circular dependency detected in service dependencies.');
  }

  return {
    deploy_order,
    dependency_graph: graph
  };
}

module.exports = {
  resolveDependencies,
  DEFAULT_SERVICE_DEPENDENCIES
};
