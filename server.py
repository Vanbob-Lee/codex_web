#!/usr/bin/env python3
"""Serve the UI and proxy browser WebSockets to the local Codex App Server."""

import argparse
import base64
import hashlib
import os
import secrets
import select
import socket
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


WEBSOCKET_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"


class CodexWebHandler(SimpleHTTPRequestHandler):
    codex_host = "127.0.0.1"
    codex_port = 4500

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=os.path.dirname(os.path.abspath(__file__)), **kwargs)

    def do_GET(self):
        if self.path == "/app-server" and self.headers.get("Upgrade", "").lower() == "websocket":
            self.proxy_websocket()
            return
        super().do_GET()

    def proxy_websocket(self):
        client_key = self.headers.get("Sec-WebSocket-Key")
        if not client_key:
            self.send_error(400, "Missing Sec-WebSocket-Key")
            return

        try:
            upstream = socket.create_connection((self.codex_host, self.codex_port), timeout=3)
            upstream_key = base64.b64encode(secrets.token_bytes(16)).decode()
            upstream_request = (
                "GET / HTTP/1.1\r\n"
                f"Host: {self.codex_host}:{self.codex_port}\r\n"
                "Upgrade: websocket\r\n"
                "Connection: Upgrade\r\n"
                f"Sec-WebSocket-Key: {upstream_key}\r\n"
                "Sec-WebSocket-Version: 13\r\n\r\n"
            )
            upstream.sendall(upstream_request.encode())
            response = self.read_headers(upstream)
            if not response.startswith(b"HTTP/1.1 101"):
                raise ConnectionError(response.decode(errors="replace").splitlines()[0])
        except OSError as error:
            self.send_error(502, f"Cannot connect to Codex App Server: {error}")
            return
        except ConnectionError as error:
            self.send_error(502, f"Codex App Server rejected WebSocket connection: {error}")
            return

        accept = base64.b64encode(
            hashlib.sha1((client_key + WEBSOCKET_GUID).encode()).digest()
        ).decode()
        self.connection.sendall(
            (
                "HTTP/1.1 101 Switching Protocols\r\n"
                "Upgrade: websocket\r\n"
                "Connection: Upgrade\r\n"
                f"Sec-WebSocket-Accept: {accept}\r\n\r\n"
            ).encode()
        )
        self.relay(self.connection, upstream)

    @staticmethod
    def read_headers(sock):
        data = b""
        while b"\r\n\r\n" not in data and len(data) < 16384:
            chunk = sock.recv(4096)
            if not chunk:
                break
            data += chunk
        return data

    @staticmethod
    def relay(client, upstream):
        try:
            while True:
                readable, _, _ = select.select((client, upstream), (), ())
                for source in readable:
                    target = upstream if source is client else client
                    chunk = source.recv(65536)
                    if not chunk:
                        return
                    target.sendall(chunk)
        finally:
            upstream.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8080)
    parser.add_argument("--codex-host", default="127.0.0.1")
    parser.add_argument("--codex-port", type=int, default=4500)
    args = parser.parse_args()

    CodexWebHandler.codex_host = args.codex_host
    CodexWebHandler.codex_port = args.codex_port
    server = ThreadingHTTPServer((args.host, args.port), CodexWebHandler)
    print(f"Serving Codex Workspace at http://{args.host}:{args.port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
