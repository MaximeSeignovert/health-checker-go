package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
)

const collectionName = "system_metrics"

type config struct {
	pocketBaseURL       string
	superuserEmail      string
	superuserPassword   string
	frontendHealthURL   string
	pocketBaseHealthURL string
	procPath            string
	diskPath            string
	interval            time.Duration
	healthTimeout       time.Duration
	retention           time.Duration
	hostname            string
}

type serviceStatus struct {
	Healthy   bool
	LatencyMS float64
}

type metricRecord struct {
	CPUPercent          float64 `json:"cpu_percent"`
	MemoryPercent       float64 `json:"memory_percent"`
	MemoryUsedBytes     float64 `json:"memory_used_bytes"`
	MemoryTotalBytes    float64 `json:"memory_total_bytes"`
	DiskPercent         float64 `json:"disk_percent"`
	DiskFreeBytes       float64 `json:"disk_free_bytes"`
	DiskTotalBytes      float64 `json:"disk_total_bytes"`
	FrontendHealthy     bool    `json:"frontend_healthy"`
	FrontendLatencyMS   float64 `json:"frontend_latency_ms"`
	PocketBaseHealthy   bool    `json:"pocketbase_healthy"`
	PocketBaseLatencyMS float64 `json:"pocketbase_latency_ms"`
	Hostname            string  `json:"hostname"`
}

type pocketBaseClient struct {
	baseURL  string
	email    string
	password string
	http     *http.Client
	token    string
}

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	cfg, err := loadConfig()
	if err != nil {
		logger.Error("invalid configuration", "error", err)
		os.Exit(1)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	system, err := newSystemCollector(cfg.procPath, cfg.diskPath)
	if err != nil {
		logger.Error("unable to initialize system collector", "error", err)
		os.Exit(1)
	}

	pb := &pocketBaseClient{
		baseURL:  strings.TrimRight(cfg.pocketBaseURL, "/"),
		email:    cfg.superuserEmail,
		password: cfg.superuserPassword,
		http:     &http.Client{Timeout: 10 * time.Second},
	}

	if err := waitForPocketBase(ctx, pb, logger); err != nil {
		logger.Info("collector stopped before PocketBase became ready")
		return
	}

	logger.Info("collector started", "interval", cfg.interval.String(), "retention", cfg.retention.String(), "hostname", cfg.hostname)
	collectAndStore(ctx, cfg, system, pb, logger)

	ticker := time.NewTicker(cfg.interval)
	cleanupTicker := time.NewTicker(time.Hour)
	defer ticker.Stop()
	defer cleanupTicker.Stop()

	for {
		select {
		case <-ctx.Done():
			logger.Info("collector stopped")
			return
		case <-ticker.C:
			collectAndStore(ctx, cfg, system, pb, logger)
		case <-cleanupTicker.C:
			if err := pb.cleanup(ctx, time.Now().Add(-cfg.retention)); err != nil {
				logger.Warn("retention cleanup failed", "error", err)
			}
		}
	}
}

func loadConfig() (config, error) {
	hostname, _ := os.Hostname()
	cfg := config{
		pocketBaseURL:       envOr("POCKETBASE_URL", "http://pocketbase:8090"),
		superuserEmail:      os.Getenv("PB_SUPERUSER_EMAIL"),
		superuserPassword:   os.Getenv("PB_SUPERUSER_PASSWORD"),
		frontendHealthURL:   envOr("FRONTEND_HEALTH_URL", "http://frontend/health"),
		pocketBaseHealthURL: envOr("POCKETBASE_HEALTH_URL", "http://pocketbase:8090/api/health"),
		procPath:            envOr("PROC_PATH", "/proc"),
		diskPath:            envOr("DISK_PATH", "/"),
		interval:            durationOr("COLLECT_INTERVAL", 15*time.Second),
		healthTimeout:       durationOr("HEALTH_TIMEOUT", 3*time.Second),
		retention:           durationOr("METRICS_RETENTION", 168*time.Hour),
		hostname:            envOr("VPS_NAME", hostname),
	}
	if cfg.superuserEmail == "" || cfg.superuserPassword == "" {
		return config{}, errors.New("PB_SUPERUSER_EMAIL and PB_SUPERUSER_PASSWORD are required")
	}
	if cfg.interval < time.Second {
		return config{}, errors.New("COLLECT_INTERVAL must be at least 1s")
	}
	return cfg, nil
}

func envOr(key, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}

func durationOr(key string, fallback time.Duration) time.Duration {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	parsed, err := time.ParseDuration(value)
	if err != nil {
		return fallback
	}
	return parsed
}

func waitForPocketBase(ctx context.Context, pb *pocketBaseClient, logger *slog.Logger) error {
	for {
		if err := pb.authenticate(ctx); err == nil {
			if err = pb.ensureCollection(ctx); err == nil {
				return nil
			}
			logger.Warn("PocketBase schema is not ready", "error", err)
		} else {
			logger.Warn("PocketBase is not ready", "error", err)
		}

		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(2 * time.Second):
		}
	}
}

func collectAndStore(ctx context.Context, cfg config, system *systemCollector, pb *pocketBaseClient, logger *slog.Logger) {
	snapshot, err := system.collect()
	if err != nil {
		logger.Error("system metric collection failed", "error", err)
		return
	}

	var frontend, pocketbase serviceStatus
	var wg sync.WaitGroup
	wg.Add(2)
	go func() {
		defer wg.Done()
		frontend = checkService(ctx, cfg.frontendHealthURL, cfg.healthTimeout)
	}()
	go func() {
		defer wg.Done()
		pocketbase = checkService(ctx, cfg.pocketBaseHealthURL, cfg.healthTimeout)
	}()
	wg.Wait()

	record := metricRecord{
		CPUPercent:          round(snapshot.cpuPercent, 2),
		MemoryPercent:       round(snapshot.memoryPercent, 2),
		MemoryUsedBytes:     float64(snapshot.memoryUsedBytes),
		MemoryTotalBytes:    float64(snapshot.memoryTotalBytes),
		DiskPercent:         round(snapshot.diskPercent, 2),
		DiskFreeBytes:       float64(snapshot.diskFreeBytes),
		DiskTotalBytes:      float64(snapshot.diskTotalBytes),
		FrontendHealthy:     frontend.Healthy,
		FrontendLatencyMS:   round(frontend.LatencyMS, 1),
		PocketBaseHealthy:   pocketbase.Healthy,
		PocketBaseLatencyMS: round(pocketbase.LatencyMS, 1),
		Hostname:            cfg.hostname,
	}

	if err := pb.createRecord(ctx, record); err != nil {
		logger.Error("metric storage failed", "error", err)
		return
	}
	logger.Debug("metric stored", "cpu", record.CPUPercent, "memory", record.MemoryPercent, "disk", record.DiskPercent, "frontend", record.FrontendHealthy, "pocketbase", record.PocketBaseHealthy)
}

func checkService(parent context.Context, endpoint string, timeout time.Duration) serviceStatus {
	ctx, cancel := context.WithTimeout(parent, timeout)
	defer cancel()
	start := time.Now()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return serviceStatus{}
	}
	resp, err := http.DefaultClient.Do(req)
	latency := float64(time.Since(start).Microseconds()) / 1000
	if err != nil {
		return serviceStatus{LatencyMS: latency}
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 1024))
	return serviceStatus{Healthy: resp.StatusCode >= 200 && resp.StatusCode < 400, LatencyMS: latency}
}

func (pb *pocketBaseClient) authenticate(ctx context.Context) error {
	payload := map[string]string{"identity": pb.email, "password": pb.password}
	var response struct {
		Token string `json:"token"`
	}
	status, err := pb.doJSON(ctx, http.MethodPost, "/api/collections/_superusers/auth-with-password", "", payload, &response)
	if err != nil {
		return err
	}
	if status != http.StatusOK || response.Token == "" {
		return fmt.Errorf("superuser authentication returned HTTP %d", status)
	}
	pb.token = response.Token
	return nil
}

func (pb *pocketBaseClient) ensureCollection(ctx context.Context) error {
	status, err := pb.doJSON(ctx, http.MethodGet, "/api/collections/"+collectionName, pb.token, nil, nil)
	if err != nil {
		return err
	}
	if status == http.StatusOK {
		return nil
	}
	if status != http.StatusNotFound {
		return fmt.Errorf("collection lookup returned HTTP %d", status)
	}

	fields := []map[string]any{
		{"name": "cpu_percent", "type": "number", "required": true, "min": 0, "max": 100},
		{"name": "memory_percent", "type": "number", "required": true, "min": 0, "max": 100},
		{"name": "memory_used_bytes", "type": "number", "required": true, "min": 0},
		{"name": "memory_total_bytes", "type": "number", "required": true, "min": 0},
		{"name": "disk_percent", "type": "number", "required": true, "min": 0, "max": 100},
		{"name": "disk_free_bytes", "type": "number", "required": true, "min": 0},
		{"name": "disk_total_bytes", "type": "number", "required": true, "min": 0},
		{"name": "frontend_healthy", "type": "bool"},
		{"name": "frontend_latency_ms", "type": "number", "min": 0},
		{"name": "pocketbase_healthy", "type": "bool"},
		{"name": "pocketbase_latency_ms", "type": "number", "min": 0},
		{"name": "hostname", "type": "text", "max": 255},
	}
	payload := map[string]any{
		"name":       collectionName,
		"type":       "base",
		"listRule":   "",
		"viewRule":   "",
		"createRule": nil,
		"updateRule": nil,
		"deleteRule": nil,
		"fields":     fields,
		"indexes":    []string{"CREATE INDEX idx_system_metrics_created ON system_metrics (created)"},
	}
	status, err = pb.doJSON(ctx, http.MethodPost, "/api/collections", pb.token, payload, nil)
	if err != nil {
		return err
	}
	if status != http.StatusOK {
		return fmt.Errorf("collection creation returned HTTP %d", status)
	}
	return nil
}

func (pb *pocketBaseClient) createRecord(ctx context.Context, record metricRecord) error {
	status, err := pb.doJSON(ctx, http.MethodPost, "/api/collections/"+collectionName+"/records", pb.token, record, nil)
	if err != nil {
		return err
	}
	if status == http.StatusUnauthorized {
		if err := pb.authenticate(ctx); err != nil {
			return err
		}
		status, err = pb.doJSON(ctx, http.MethodPost, "/api/collections/"+collectionName+"/records", pb.token, record, nil)
		if err != nil {
			return err
		}
	}
	if status != http.StatusOK {
		return fmt.Errorf("record creation returned HTTP %d", status)
	}
	return nil
}

func (pb *pocketBaseClient) cleanup(ctx context.Context, cutoff time.Time) error {
	filter := fmt.Sprintf(`created < "%s"`, cutoff.UTC().Format("2006-01-02 15:04:05.000Z"))
	path := "/api/collections/" + collectionName + "/records?perPage=500&fields=id&sort=created&filter=" + url.QueryEscape(filter)
	var response struct {
		Items []struct {
			ID string `json:"id"`
		} `json:"items"`
	}
	status, err := pb.doJSON(ctx, http.MethodGet, path, pb.token, nil, &response)
	if err != nil {
		return err
	}
	if status != http.StatusOK {
		return fmt.Errorf("cleanup lookup returned HTTP %d", status)
	}
	for _, item := range response.Items {
		status, err = pb.doJSON(ctx, http.MethodDelete, "/api/collections/"+collectionName+"/records/"+item.ID, pb.token, nil, nil)
		if err != nil {
			return err
		}
		if status != http.StatusNoContent {
			return fmt.Errorf("cleanup delete returned HTTP %d", status)
		}
	}
	return nil
}

func (pb *pocketBaseClient) doJSON(ctx context.Context, method, path, token string, body any, result any) (int, error) {
	var requestBody io.Reader
	if body != nil {
		encoded, err := json.Marshal(body)
		if err != nil {
			return 0, err
		}
		requestBody = bytes.NewReader(encoded)
	}
	req, err := http.NewRequestWithContext(ctx, method, pb.baseURL+path, requestBody)
	if err != nil {
		return 0, err
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if token != "" {
		req.Header.Set("Authorization", token)
	}
	resp, err := pb.http.Do(req)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()
	limited, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return 0, err
	}
	if resp.StatusCode >= 400 && resp.StatusCode != http.StatusNotFound && resp.StatusCode != http.StatusUnauthorized {
		return resp.StatusCode, fmt.Errorf("PocketBase HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(limited)))
	}
	if result != nil && len(limited) > 0 {
		if err := json.Unmarshal(limited, result); err != nil {
			return resp.StatusCode, err
		}
	}
	return resp.StatusCode, nil
}

func round(value float64, places int) float64 {
	power, _ := strconv.ParseFloat("1e"+strconv.Itoa(places), 64)
	return float64(int64(value*power+0.5)) / power
}
