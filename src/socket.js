// src/socket.js
import { Server } from "socket.io";

let io = null;

export function createSocket(server) {
  if (io) return io;
  io = new Server(server, { cors: { origin: "*" } });
  return io;
}

export { io };
