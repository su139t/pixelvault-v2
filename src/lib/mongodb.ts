import mongoose from "mongoose";
import dotenv from "dotenv";
// dotenv.config({ path: ".env.local" });
dotenv.config();

function getMongoUri(): string {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is missing from .env.local");
  }
  return uri;
}

const MONGODB_URI = getMongoUri();

if (!MONGODB_URI) {
  throw new Error("MONGODB_URI is missing from .env.local");
}

type MongooseCache = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

declare global {
  // Reuse the connection during Next.js development reloads.
  var mongooseCache: MongooseCache | undefined;
}

const cached =
  globalThis.mongooseCache ??
  (globalThis.mongooseCache = {
    conn: null,
    promise: null,
  });

async function connectDB(): Promise<typeof mongoose> {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    cached.promise = mongoose
      .connect(MONGODB_URI, {
        serverSelectionTimeoutMS: 2000,
      })
      .catch(async (primaryError) => {
        if (
          process.env.NODE_ENV !== "production" &&
          !MONGODB_URI.includes("localhost") &&
          !MONGODB_URI.includes("127.0.0.1")
        ) {
          console.warn(
            "Primary MongoDB connection failed (likely Atlas IP whitelist). Falling back to mongodb://localhost:27017/pixelvault for development.",
          );
          return mongoose.connect("mongodb://localhost:27017/pixelvault", {
            serverSelectionTimeoutMS: 3000,
          });
        }
        throw primaryError;
      });
  }

  try {
    cached.conn = await cached.promise;
    console.log("MongoDB connected successfully");
    return cached.conn;
  } catch (error) {
    cached.promise = null;

    console.error(
      "MongoDB connection failed:",
      error instanceof Error ? error.message : error,
    );

    throw error;
  }
}

export default connectDB;
