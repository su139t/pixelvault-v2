import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  throw new Error("MONGODB_URI is not set");
}

type MongooseCache = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

declare global {
  var mongooseCache: MongooseCache | undefined;
}

const cached =
  globalThis.mongooseCache ??
  (globalThis.mongooseCache = { conn: null, promise: null });

async function connectDB(): Promise<typeof mongoose> {
  if (cached.conn) return cached.conn;

  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGODB_URI as string, {
      serverSelectionTimeoutMS: 10000,
    });
  }

  try {
    cached.conn = await cached.promise;
    console.log(
      `MongoDB connected: host=${cached.conn.connection.host} db=${cached.conn.connection.name}`,
    );
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
