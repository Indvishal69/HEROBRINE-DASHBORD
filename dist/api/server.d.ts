import http from "node:http";
import { Server as SocketServer } from "socket.io";
export declare function startServer(port: number): {
    app: import("express-serve-static-core").Express;
    webServer: http.Server<typeof http.IncomingMessage, typeof http.ServerResponse>;
    io: SocketServer<import("socket.io").DefaultEventsMap, import("socket.io").DefaultEventsMap, import("socket.io").DefaultEventsMap, any>;
};
