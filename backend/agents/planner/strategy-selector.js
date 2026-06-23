/**
 * Selects the optimal deployment strategy based on risk score, database changes, and impact metrics.
 * 
 * @param {Object} params
 * @param {number} params.riskScore - Risk score of the change (0-100)
 * @param {boolean} params.hasDbMigration - True if database migration files are present
 * @param {Array<string>} params.changedServices - List of affected service names
 * @param {number} params.usersAffected - Number of users potentially affected
 * @returns {Object} Strategy name and deployment stages
 */
function selectStrategy({ riskScore, hasDbMigration, changedServices = [], usersAffected = 0 }) {
  let strategy = 'rolling';
  let stages = [];

  if (hasDbMigration) {
    strategy = 'maintenance window';
    stages = [
      { name: 'drain_traffic', traffic_percent: 0, wait_minutes: 5, health_checks: ['active_connections'] },
      { name: 'run_migrations', traffic_percent: 0, wait_minutes: 0, health_checks: ['db_migration_status'] },
      { name: 'deploy_new_version', traffic_percent: 0, wait_minutes: 5, health_checks: ['service_health'] },
      { name: 'restore_traffic', traffic_percent: 100, wait_minutes: 0, health_checks: ['service_health', 'error_rate'] }
    ];
  } else if (riskScore >= 61) {
    strategy = 'canary';
    stages = [
      { name: 'canary_5', traffic_percent: 5, wait_minutes: 10, health_checks: ['error_rate', 'latency'] },
      { name: 'canary_25', traffic_percent: 25, wait_minutes: 15, health_checks: ['error_rate', 'latency'] },
      { name: 'production_100', traffic_percent: 100, wait_minutes: 0, health_checks: ['error_rate', 'latency'] }
    ];
  } else if (riskScore >= 31) {
    strategy = 'blue/green';
    stages = [
      { name: 'deploy_green', traffic_percent: 0, wait_minutes: 5, health_checks: ['green_health'] },
      { name: 'switch_traffic', traffic_percent: 100, wait_minutes: 10, health_checks: ['service_health', 'error_rate'] },
      { name: 'decommission_blue', traffic_percent: 100, wait_minutes: 0, health_checks: [] }
    ];
  } else {
    strategy = 'rolling';
    stages = [
      { name: 'rolling_update', traffic_percent: 100, wait_minutes: 5, health_checks: ['service_health', 'error_rate'] }
    ];
  }

  return {
    strategy,
    stages
  };
}

module.exports = {
  selectStrategy
};
