routerAdd("GET", "/api/vps-watch/metrics", (event) => {
  const metricRanges = {
    "1h": { durationMs: 60 * 60 * 1000, bucketSeconds: 30 },
    "24h": { durationMs: 24 * 60 * 60 * 1000, bucketSeconds: 5 * 60 },
    "7d": { durationMs: 7 * 24 * 60 * 60 * 1000, bucketSeconds: 30 * 60 },
  }
  const latestMetricShape = {
    id: "",
    cpu_percent: -0,
    memory_percent: -0,
    memory_used_bytes: -0,
    memory_total_bytes: -0,
    disk_percent: -0,
    disk_free_bytes: -0,
    disk_total_bytes: -0,
    frontend_healthy: false,
    frontend_latency_ms: -0,
    pocketbase_healthy: false,
    pocketbase_latency_ms: -0,
    hostname: "",
    created: "",
  }
  const metricPointShape = {
    created: "",
    cpu_percent: -0,
    memory_percent: -0,
    disk_percent: -0,
  }
  const range = event.request.url.query().get("range") || "1h"
  const rangeConfig = metricRanges[range]
  if (!rangeConfig) {
    throw new BadRequestError("La période demandée n'est pas prise en charge.")
  }

  const toDate = new Date()
  const fromDate = new Date(toDate.getTime() - rangeConfig.durationMs)
  const from = fromDate.toISOString().replace("T", " ")
  const to = toDate.toISOString().replace("T", " ")

  const latestRows = arrayOf(new DynamicModel(latestMetricShape))
  $app.db()
    .newQuery(`
      SELECT
        id,
        cpu_percent,
        memory_percent,
        memory_used_bytes,
        memory_total_bytes,
        disk_percent,
        disk_free_bytes,
        disk_total_bytes,
        frontend_healthy,
        frontend_latency_ms,
        pocketbase_healthy,
        pocketbase_latency_ms,
        hostname,
        created
      FROM system_metrics
      ORDER BY created DESC
      LIMIT 1
    `)
    .all(latestRows)

  const points = arrayOf(new DynamicModel(metricPointShape))
  $app.db()
    .newQuery(`
      SELECT
        datetime(
          (CAST(strftime('%s', created) AS INTEGER) / {:bucketSeconds}) * {:bucketSeconds},
          'unixepoch'
        ) || '.000Z' AS created,
        AVG(cpu_percent) AS cpu_percent,
        AVG(memory_percent) AS memory_percent,
        AVG(disk_percent) AS disk_percent
      FROM system_metrics
      WHERE created >= {:from} AND created <= {:to}
      GROUP BY CAST(strftime('%s', created) AS INTEGER) / {:bucketSeconds}
      ORDER BY MIN(created) ASC
    `)
    .bind({
      bucketSeconds: rangeConfig.bucketSeconds,
      from,
      to,
    })
    .all(points)

  return event.json(200, {
    range,
    bucketSeconds: rangeConfig.bucketSeconds,
    from: fromDate.toISOString(),
    to: toDate.toISOString(),
    latest: latestRows.length > 0 ? latestRows[0] : null,
    items: points,
  })
}, $apis.requireAuth("dashboard_users"))
