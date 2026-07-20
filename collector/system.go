package main

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

type cpuTimes struct {
	total uint64
	idle  uint64
}

type systemSnapshot struct {
	cpuPercent       float64
	memoryPercent    float64
	memoryUsedBytes  uint64
	memoryTotalBytes uint64
	diskPercent      float64
	diskFreeBytes    uint64
	diskTotalBytes   uint64
}

type systemCollector struct {
	procPath string
	diskPath string
	previous cpuTimes
}

func newSystemCollector(procPath, diskPath string) (*systemCollector, error) {
	previous, err := readCPUTimes(filepath.Join(procPath, "stat"))
	if err != nil {
		return nil, err
	}
	return &systemCollector{procPath: procPath, diskPath: diskPath, previous: previous}, nil
}

func (c *systemCollector) collect() (systemSnapshot, error) {
	current, err := readCPUTimes(filepath.Join(c.procPath, "stat"))
	if err != nil {
		return systemSnapshot{}, err
	}
	cpu := cpuUsage(c.previous, current)
	c.previous = current

	memoryTotal, memoryAvailable, err := readMemory(filepath.Join(c.procPath, "meminfo"))
	if err != nil {
		return systemSnapshot{}, err
	}
	diskTotal, diskFree, err := diskUsage(c.diskPath)
	if err != nil {
		return systemSnapshot{}, err
	}

	memoryUsed := memoryTotal - memoryAvailable
	diskUsed := diskTotal - diskFree
	return systemSnapshot{
		cpuPercent:       cpu,
		memoryPercent:    percent(memoryUsed, memoryTotal),
		memoryUsedBytes:  memoryUsed,
		memoryTotalBytes: memoryTotal,
		diskPercent:      percent(diskUsed, diskTotal),
		diskFreeBytes:    diskFree,
		diskTotalBytes:   diskTotal,
	}, nil
}

func readCPUTimes(path string) (cpuTimes, error) {
	file, err := os.Open(path)
	if err != nil {
		return cpuTimes{}, err
	}
	defer file.Close()
	scanner := bufio.NewScanner(file)
	if !scanner.Scan() {
		return cpuTimes{}, fmt.Errorf("%s is empty", path)
	}
	fields := strings.Fields(scanner.Text())
	if len(fields) < 5 || fields[0] != "cpu" {
		return cpuTimes{}, fmt.Errorf("invalid aggregate CPU line in %s", path)
	}
	var values []uint64
	for _, field := range fields[1:] {
		value, parseErr := strconv.ParseUint(field, 10, 64)
		if parseErr != nil {
			return cpuTimes{}, parseErr
		}
		values = append(values, value)
	}
	var total uint64
	for _, value := range values {
		total += value
	}
	idle := values[3]
	if len(values) > 4 {
		idle += values[4]
	}
	return cpuTimes{total: total, idle: idle}, nil
}

func cpuUsage(previous, current cpuTimes) float64 {
	if current.total <= previous.total || current.idle < previous.idle {
		return 0
	}
	totalDelta := current.total - previous.total
	idleDelta := current.idle - previous.idle
	return float64(totalDelta-idleDelta) / float64(totalDelta) * 100
}

func readMemory(path string) (total uint64, available uint64, err error) {
	file, err := os.Open(path)
	if err != nil {
		return 0, 0, err
	}
	defer file.Close()
	values := make(map[string]uint64)
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		fields := strings.Fields(scanner.Text())
		if len(fields) < 2 {
			continue
		}
		value, parseErr := strconv.ParseUint(fields[1], 10, 64)
		if parseErr == nil {
			values[strings.TrimSuffix(fields[0], ":")] = value * 1024
		}
	}
	if err := scanner.Err(); err != nil {
		return 0, 0, err
	}
	total = values["MemTotal"]
	available = values["MemAvailable"]
	if total == 0 {
		return 0, 0, fmt.Errorf("MemTotal missing in %s", path)
	}
	if available > total {
		available = total
	}
	return total, available, nil
}

func percent(used, total uint64) float64 {
	if total == 0 {
		return 0
	}
	return float64(used) / float64(total) * 100
}
