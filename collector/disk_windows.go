//go:build windows

package main

import (
	"fmt"
	"syscall"
	"unsafe"
)

func diskUsage(path string) (total uint64, free uint64, err error) {
	root, err := syscall.UTF16PtrFromString(path)
	if err != nil {
		return 0, 0, err
	}
	var available, totalBytes, totalFree uint64
	kernel32 := syscall.NewLazyDLL("kernel32.dll")
	getDiskFreeSpaceEx := kernel32.NewProc("GetDiskFreeSpaceExW")
	result, _, callErr := getDiskFreeSpaceEx.Call(
		uintptr(unsafe.Pointer(root)),
		uintptr(unsafe.Pointer(&available)),
		uintptr(unsafe.Pointer(&totalBytes)),
		uintptr(unsafe.Pointer(&totalFree)),
	)
	if result == 0 {
		return 0, 0, fmt.Errorf("GetDiskFreeSpaceExW: %w", callErr)
	}
	return totalBytes, available, nil
}
