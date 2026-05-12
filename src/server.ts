import dotenv from "dotenv";
import app from "./app";
import fs from "fs";
import path from "path";

// Load environment variables from .env file
dotenv.config();

const PORT = process.env.PORT || 5000;

// Ensure the local uploads folder exists on startup
const uploadsDir = path.join(__dirname, "../uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log("[Startup] Created local uploads folder at:", uploadsDir);
}

// Start listening for incoming HTTP requests
const server = app.listen(PORT, () => {
  console.log(`=========================================`);
  console.log(`🚀 Server running in ${process.env.NODE_ENV || "development"} mode`);
  console.log(`🔊 Listening on http://localhost:${PORT}`);
  console.log(`📂 Uploads directory: ${uploadsDir}`);
  console.log(`=========================================`);
});

// Graceful shutdown handling
process.on("SIGINT", () => {
  console.log("\n[Server] Shutting down gracefully...");
  server.close(() => {
    console.log("[Server] Connection pool closed.");
    process.exit(0);
  });
});
