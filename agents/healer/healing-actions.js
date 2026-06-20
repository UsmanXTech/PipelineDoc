const HEALING_ACTIONS = {
  pod_oom: {
    detect: "pod restart count > 3 in 10 minutes AND reason=OOMKilled",
    action: "kubectl set resources deployment $NAME --limits=memory=$CURRENT_MEM_LIMIT*2",
    verify: "kubectl rollout status deployment $NAME"
  },
  disk_full: {
    detect: "disk usage > 95%",
    action: "find /var/log -name '*.log' -mtime +7 -delete && docker system prune -f",
    verify: "df -h | awk '{print $5}' | grep -v Use | sort -n | tail -1"
  },
  connection_pool_exhausted: {
    detect: "error log contains 'too many connections' OR 'connection pool exhausted'",
    action: "kubectl rollout restart deployment $NAME",
    verify: "check error rate drops below baseline within 2 minutes"
  },
  service_unhealthy: {
    detect: "health check endpoint returning non-200 for > 2 minutes",
    action: "kubectl rollout restart deployment $NAME",
    verify: "kubectl rollout status deployment $NAME --timeout=5m"
  }
};

module.exports = {
  HEALING_ACTIONS
};
