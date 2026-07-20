package main

import "testing"

func TestCPUUsage(t *testing.T) {
	got := cpuUsage(cpuTimes{total: 100, idle: 40}, cpuTimes{total: 200, idle: 70})
	if got != 70 {
		t.Fatalf("cpuUsage() = %v, want 70", got)
	}
}

func TestPercent(t *testing.T) {
	if got := percent(25, 100); got != 25 {
		t.Fatalf("percent() = %v, want 25", got)
	}
	if got := percent(1, 0); got != 0 {
		t.Fatalf("percent() with zero total = %v, want 0", got)
	}
}

func TestHasCollectionField(t *testing.T) {
	fields := []map[string]any{
		{"name": "id", "type": "text"},
		createdField(),
	}
	if !hasCollectionField(fields, "created") {
		t.Fatal("hasCollectionField() should find the created field")
	}
	if hasCollectionField(fields, "updated") {
		t.Fatal("hasCollectionField() should not find an absent field")
	}
}

func TestEnsureCollectionIndex(t *testing.T) {
	existing := []string{"CREATE INDEX idx_existing ON system_metrics (hostname)"}
	got := ensureCollectionIndex(existing, "idx_system_metrics_created", metricsCreatedIndex)
	if len(got) != 2 || got[0] != existing[0] || got[1] != metricsCreatedIndex {
		t.Fatalf("ensureCollectionIndex() = %#v, want existing index followed by created index", got)
	}

	got = ensureCollectionIndex(got, "idx_system_metrics_created", metricsCreatedIndex)
	if len(got) != 2 {
		t.Fatalf("ensureCollectionIndex() duplicated index: %#v", got)
	}
}
