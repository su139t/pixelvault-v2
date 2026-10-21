import { createHash, randomBytes } from "node:crypto";

import { Types } from "mongoose";
import WebSession from "@/models/WebSession";

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createWebSession(userId: Types.ObjectId) {
  // Raw token is returned once; only its hash is stored in MongoDB.
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  await WebSession.create({
    userId,
    tokenHash: hashToken(token),
    expiresAt,
  });

  return { token, expiresAt };
}

export async function verifyWebSession(token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) {
    return null;
  }

  const session = await WebSession.findOne({
    tokenHash: hashToken(token),
    expiresAt: { $gt: new Date() },
  }).select("+tokenHash");

  if (!session) {
    return null;
  }

  return {
    sessionId: session._id,
    userId: session.userId,
    expiresAt: session.expiresAt,
  };
}

export async function revokeWebSession(token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) {
    return;
  }

  await WebSession.deleteOne({
    tokenHash: hashToken(token),
  });
}
