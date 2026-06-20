# Postmortem Report

## Timeline
- 10:00 Incident started
- 10:05 Identified database connection issue

## Root Cause
Port 5432 connection refused on DB host.

## Impact
Duration: 5 minutes. 100% of API requests failing.

## Resolution
Postgres container restarted.

## Action Items
1. Add health checks to Postgres container.
2. Configure alert notifications.
3. Document connection retry logic.