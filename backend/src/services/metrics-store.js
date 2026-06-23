const metrics = {
  rca_requests_total: 0,
  rca_duration_sum: 0,
  gate_decisions: {
    PASS: 0,
    BLOCK: 0,
    WARN: 0
  },
  healing_actions: {
    service_restart: 0,
    rollback: 0,
    hotfix: 0
  }
};

function incrementRca(durationMs) {
  metrics.rca_requests_total++;
  metrics.rca_duration_sum += durationMs;
}

function incrementGate(result) {
  const normalized = (result || 'PASS').toUpperCase();
  if (normalized in metrics.gate_decisions) {
    metrics.gate_decisions[normalized]++;
  } else {
    metrics.gate_decisions[normalized] = 1;
  }
}

function incrementHealing(type) {
  const normalized = type || 'service_restart';
  if (normalized in metrics.healing_actions) {
    metrics.healing_actions[normalized]++;
  } else {
    metrics.healing_actions[normalized] = 1;
  }
}

function getPrometheusText() {
  return `# HELP rca_requests_total Total number of RCA requests analyzed
# TYPE rca_requests_total counter
rca_requests_total ${metrics.rca_requests_total}

# HELP rca_duration_ms_sum Total duration of RCA analysis in milliseconds
# TYPE rca_duration_ms_sum counter
rca_duration_ms_sum ${metrics.rca_duration_sum}

# HELP gate_decisions_total Total number of gate evaluations
# TYPE gate_decisions_total counter
gate_decisions_total{result="PASS"} ${metrics.gate_decisions.PASS}
gate_decisions_total{result="BLOCK"} ${metrics.gate_decisions.BLOCK}
gate_decisions_total{result="WARN"} ${metrics.gate_decisions.WARN}

# HELP healing_actions_total Total number of automated healing actions triggered
# TYPE healing_actions_total counter
healing_actions_total{type="service_restart"} ${metrics.healing_actions.service_restart}
healing_actions_total{type="rollback"} ${metrics.healing_actions.rollback}
healing_actions_total{type="hotfix"} ${metrics.healing_actions.hotfix}
`;
}

module.exports = {
  incrementRca,
  incrementGate,
  incrementHealing,
  getPrometheusText
};
