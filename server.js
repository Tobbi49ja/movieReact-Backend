require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const dns = require("dns").promises;
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

// ✅ CORS
app.use(
  cors({
    origin: "https://moviereact-zzye.onrender.com/", // Frontend port
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  })
);
app.use(express.json());
app.use(express.static(path.join(__dirname, "../client")));

// ✅ Load env vars
const localMongoUri = process.env.LOCAL_URI;
const atlasMongoUri = process.env.ATLAS_URI;
const jwtSecret = process.env.JWT_SECRET;
const port = process.env.PORT || 5000;

// 🔑 Debug check
console.log("🔑 ENV CHECK:");
console.log("LOCAL_URI:", localMongoUri ? "✅ Loaded" : "❌ Missing");
console.log("ATLAS_URI:", atlasMongoUri ? "✅ Loaded" : "❌ Missing");
console.log("JWT_SECRET:", jwtSecret ? "✅ Loaded" : "❌ Missing");

if (!atlasMongoUri || !jwtSecret) {
  console.error("❌ Missing required environment variables");
  process.exit(1);
}

// ✅ Mongo options
const connectionOptions = {
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
  connectTimeoutMS: 10000,
  socketTimeoutMS: 45000,
  retryWrites: true,
  retryReads: true,
};

// ✅ Internet check
async function isOnline() {
  try {
    await dns.lookup("google.com");
    return true;
  } catch {
    return false;
  }
}

// ✅ Connect to MongoDB
const connectToMongoDB = async () => {
  const online = await isOnline();

  if (process.env.RENDER || process.env.NODE_ENV === "production") {
    console.log("🌐 Production mode → connecting only to Atlas");
    await mongoose.connect(atlasMongoUri, connectionOptions);
    console.log("✅ Connected to MongoDB Atlas");
    app.locals.dbEnv = "atlas";
  } else {
    if (online && atlasMongoUri) {
      console.log("🌐 Online → trying Atlas");
      await mongoose.connect(atlasMongoUri, connectionOptions);
      console.log("✅ Connected to MongoDB Atlas");
      app.locals.dbEnv = "atlas";
    } else if (localMongoUri) {
      console.log("🖥️ Offline → using Local MongoDB");
      await mongoose.connect(localMongoUri, connectionOptions);
      console.log("✅ Connected to Local MongoDB");
      app.locals.dbEnv = "local";
    } else {
      console.error("❌ No valid MongoDB URI available");
      process.exit(1);
    }
  }
};

// ✅ Logging middleware
app.use((req, res, next) => {
  console.log(`[API] ${req.method} ${req.url} → DB: ${app.locals.dbEnv || "unknown"}`);
  next();
});

// ✅ ROUTES
const commentRoutes = require("./Routes/comments");
app.use("/api/comments", commentRoutes); // supports both movie & TV

// ✅ SOCKET.IO logic
io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);

  // join room
  socket.on('join_room', ({ contentType, contentId }) => {
    const room = `${contentType}_${contentId}`;
    socket.join(room);
    console.log(`Socket ${socket.id} joined room: ${room}`);
  });

  socket.on('leave_room', ({ contentType, contentId }) => {
    const room = `${contentType}_${contentId}`;
    socket.leave(room);
    console.log(`Socket ${socket.id} left room: ${room}`);
  });

  // new comment broadcast
  socket.on('send_comment', (comment) => {
    const room = `${comment.contentType}_${comment.contentId}`;
    socket.to(room).emit('new_comment', comment);
  });

  // like broadcast
  socket.on('like_comment', (updatedComment) => {
    const room = `${updatedComment.contentType}_${updatedComment.contentId}`;
    socket.to(room).emit('comment_liked', updatedComment);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});


// ✅ Start server
connectToMongoDB().then(() => {
  server.listen(port, () =>
    console.log(`🚀 Server running at http://localhost:${port}`)
  );
});
