# Disaster Recovery Runbook

## Overview
This document covers recovery procedures for the P2P Processing Platform.

## Architecture
- **API**: NestJS stateless containers (2+ replicas)
- **Database**: PostgreSQL (primary + read replica)
- **Cache/Queue**: Redis (Sentinel or Cluster)
- **Files**: S3-compatible storage

## Backup Strategy

### Database
- **Automated**: Daily pg_dump via cron or managed DB snapshots
- **Retention**: 30 days for daily, 12 months for monthly
- **Testing**: Monthly restore test to staging

### File Storage
- S3 versioning enabled
- Cross-region replication for production

### Redis
- RDB snapshots every 15 minutes
- AOF persistence enabled

## Recovery Procedures

### 1. API Service Failure
**Symptoms**: Health check fails, 5xx errors
**Steps**:
1. Check container logs: `docker logs <container>`
2. Verify DB connectivity: `curl /api/health`
3. Restart service: `docker compose restart api`
4. If persistent, rollback to last known good image

### 2. Database Failure
**Symptoms**: Connection refused, query timeouts
**Steps**:
1. Check PostgreSQL status
2. Verify connections: `pg_isready -h <host>`
3. For managed DB: check provider dashboard
4. Failover to read replica if available
5. Restore from backup if data loss

### 3. Redis Failure
**Symptoms**: Queue processing stops, rate limiting fails
**Steps**:
1. Check Redis connectivity: `redis-cli ping`
2. Restart Redis: `docker compose restart redis`
3. Webhook queue will auto-recover (outbox pattern)
4. Rate limiting restarts with clean state

### 4. Full System Restore
1. Provision infrastructure (DB, Redis, S3)
2. Restore database from latest backup
3. Deploy API and Web containers
4. Run health checks
5. Verify webhook delivery resumes

## Monitoring Alerts
- API p95 latency > 500ms
- Error rate > 5%
- Database connection pool > 80%
- Redis memory > 80%
- Disk usage > 85%
- Queue depth > 1000

## Contact
- On-call: [Configure PagerDuty/Opsgenie]
- Escalation: Team lead → CTO
