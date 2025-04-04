import cors from "cors";
import express from "express";
import { createServer } from "http";
import morgan from "morgan";
import { Server } from "socket.io";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

// Store this in Redis or an appropriate database
let users = [];

// Create server
const app = express();
const httpServer = createServer(app);

// Create socket.io server
const io = new Server(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(cors());
app.use(morgan("combined"));
app.use(express.json());

app.get("/users", (req, res) => {
   res.json({
    message : "hello"
   })
});

// Socket middleware for authentication
io.use((socket, next) => {
    if (socket.handshake.query?.callerId) {
        socket.user = socket.handshake.query.callerId;
        next();
    } else {
        console.log("No token found");
        next(new Error("No token found"));
    }
});

// Handle socket connections & events
io.on("connection", (socket) => {
    console.log("New connection on socket server, user:", socket.user);
    socket.join(socket.user);

    // Notify this user of online users
    io.to(socket.user).emit("new-users", { users });

    // Notify existing users about the new user
    if (!users.includes(socket.user)) {
        users.forEach((user) => {
            io.to(user).emit("new-user", { user: socket.user });
        });
        users.push(socket.user);
    }

    // Handle call events
    socket.on("start-call", ({ to }) => {
        io.to(to).emit("incoming-call", { from: socket.user });
    });

    socket.on("accept-call", ({ to }) => {
        io.to(to).emit("call-accepted", { to });
    });

    socket.on("deny-call", ({ to }) => {
        io.to(to).emit("call-denied", { to });
    });

    socket.on("leave-call", ({ to }) => {
        io.to(to).emit("left-call", { to });
    });

    // WebRTC signaling
    socket.on("offer", ({ to, offer }) => {
        io.to(to).emit("offer", { to, offer });
    });

    socket.on("offer-answer", ({ to, answer }) => {
        io.to(to).emit("offer-answer", { to, answer });
    });

    socket.on("ice-candidate", ({ to, candidate }) => {
        io.to(to).emit("ice-candidate", { to, candidate });
    });

    // Handle user disconnection
    socket.on("disconnect", () => {
        users = users.filter((u) => u !== socket.user);
        users.forEach((user) => {
            io.to(user).emit("user-left", { user: socket.user });
        });
        console.log("User disconnected:", socket.user);
    });
});

// Root endpoint
app.get("/", (_req, res) => {
    res.json({
        server: "Signal #T90",
        running: true
    });
});

// Start server
const PORT = process.env.PORT || 1010;
httpServer.listen(PORT, () => {
    console.log(`Listening on port ${PORT}`);
});
