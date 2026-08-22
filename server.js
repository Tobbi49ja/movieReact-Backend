// server.js
require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const dns = require("dns");

if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder("ipv4first");
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

const allowedOrigins = [
  "http://localhost:5173",
  "https://moviereact-zzye.onrender.com",
];

app.use(
  cors({
    origin: allowedOrigins,
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  })
);

app.use(express.json());
app.use(express.static(path.join(__dirname, "../client")));

const localMongoUri = process.env.LOCAL_URI;
const atlasMongoUri = process.env.ATLAS_URI;
const jwtSecret = process.env.JWT_SECRET;
const port = process.env.PORT || 5000;

console.log("🔑 ENV CHECK:");
console.log("LOCAL_URI:", localMongoUri ? "✅ Loaded" : "❌ Missing");
console.log("ATLAS_URI:", atlasMongoUri ? "✅ Loaded" : "❌ Missing");
console.log("JWT_SECRET:", jwtSecret ? "✅ Loaded" : "❌ Missing");
console.log("EMAIL_USER:", process.env.EMAIL_USER ? "✅ Loaded" : "❌ Missing");
console.log("EMAIL_PASS:", process.env.EMAIL_PASS ? "✅ Loaded" : "❌ Missing");

const connectionOptions = {
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
  connectTimeoutMS: 10000,
  socketTimeoutMS: 45000,
  retryWrites: true,
  retryReads: true,
};

const connectToMongoDB = async () => {
  let connected = false;

  if (atlasMongoUri) {
    try {
      console.log("🌐 Connecting to MongoDB Atlas...");
      await mongoose.connect(atlasMongoUri, connectionOptions);
      console.log("✅ Connected to MongoDB Atlas");
      app.locals.dbEnv = "atlas";
      connected = true;
    } catch (err) {
      console.warn("⚠️ Initial Atlas DNS lookup failed:", err.message);
      try {
        dns.setServers(["8.8.8.8", "1.1.1.1"]);
        await mongoose.connect(atlasMongoUri, connectionOptions);
        console.log("✅ Connected to MongoDB Atlas (via Fallback DNS)");
        app.locals.dbEnv = "atlas";
        connected = true;
      } catch (retryErr) {
        console.warn("⚠️ Fallback DNS Atlas connection failed:", retryErr.message);
      }
    }
  }

  if (!connected && localMongoUri) {
    try {
      console.log("🖥️ Trying Local MongoDB...");
      await mongoose.connect(localMongoUri, connectionOptions);
      console.log("✅ Connected to Local MongoDB");
      app.locals.dbEnv = "local";
      connected = true;
    } catch (err) {
      console.warn("⚠️ Local MongoDB connection failed:", err.message);
    }
  }

  if (!connected) {
    console.warn("⚠️ Server starting without active MongoDB connection (DB-independent features like Download Proxy will continue to function).");
    app.locals.dbEnv = "disconnected";
  }
};

app.use((req, res, next) => {
  console.log(
    `[API] ${req.method} ${req.url} → DB: ${app.locals.dbEnv || "unknown"}`
  );
  next();
});

// -----------------------------
// Routes
// -----------------------------
const commentRoutes = require("./Routes/comments");
app.use("/api/comments", commentRoutes);

const reactionRoutes = require("./Routes/reactions");
app.use("/api/reactions", reactionRoutes);

const contactRoutes = require("./Routes/contact");
app.use("/api/contact", contactRoutes);

const downloadRoutes = require("./Routes/download");
app.use("/api/download", downloadRoutes);

const authRoutes = require("./Routes/auth");
app.use("/api/auth", authRoutes);

const watchlistRoutes = require("./Routes/watchlist");
app.use("/api/watchlist", watchlistRoutes);

const ratingRoutes = require("./Routes/ratings");
app.use("/api/ratings", ratingRoutes);

const adminRoutes = require("./Routes/admin");
app.use("/api/admin", adminRoutes);

// -----------------------------
// Socket.io logic
// -----------------------------
io.on("connection", (socket) => {
  console.log("New client connected:", socket.id);

  socket.on("join_room", ({ contentType, contentId }) => {
    const room = `${contentType}_${contentId}`;
    socket.join(room);
    console.log(`Socket ${socket.id} joined room: ${room}`);
  });

  socket.on("leave_room", ({ contentType, contentId }) => {
    const room = `${contentType}_${contentId}`;
    socket.leave(room);
    console.log(`Socket ${socket.id} left room: ${room}`);
  });

  socket.on("send_comment", (comment) => {
    const room = `${comment.contentType}_${comment.contentId}`;
    socket.to(room).emit("new_comment", comment);
  });

  socket.on("like_comment", (updatedComment) => {
    const room = `${updatedComment.contentType}_${updatedComment.contentId}`;
    socket.to(room).emit("comment_liked", updatedComment);
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
});

connectToMongoDB().then(() => {
  server.listen(port, () =>
    console.log(`🚀 Server running at http://localhost:${port}`)
  );
});
