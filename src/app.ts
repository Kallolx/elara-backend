import express from "express";
import cors from "cors";
import path from "path";
import apiRouter from "./routes";
import { errorHandler } from "./middlewares/error.middleware";

const app = express();

// Configure CORS to allow frontend origin connections
app.use(cors());

// Parse incoming JSON payloads
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Serve the local uploads directory statically so uploaded images are accessible on the web
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

// Mount API routes under /api
app.use("/api", apiRouter);

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({ success: true, message: "Server is healthy and running" });
});

// Fallback for non-existent routes
app.use((req, res, next) => {
  const err: any = new Error(`Route ${req.originalUrl} not found`);
  err.statusCode = 404;
  next(err);
});

// Global Error Handler
app.use(errorHandler);

export default app;
