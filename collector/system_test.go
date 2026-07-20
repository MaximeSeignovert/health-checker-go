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
