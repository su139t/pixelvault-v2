import { TelegramClient } from "teleproto";
import { StringSession } from "teleproto/sessions";
import { CustomFile } from "teleproto/client/uploads";

import { decryptTelegramSession } from "@/lib/telegram-session";

function getTelegramConfig() {
  const apiId = Number(process.env.TELEGRAM_API_ID);
  const apiHash = process.env.TELEGRAM_API_HASH;

  if (!Number.isSafeInteger(apiId) || apiId <= 0 || !apiHash) {
    throw new Error("Telegram API configuration (TELEGRAM_API_ID / TELEGRAM_API_HASH) is missing.");
  }

  return { apiId, apiHash };
}

/**
 * Validates the file buffer's magic bytes to prevent MIME-spoofing attacks.
 */
export function detectImageMimeType(
  buffer: Buffer,
): "image/jpeg" | "image/png" | "image/webp" | "image/gif" | null {
  if (buffer.length < 12) return null;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }

  // PNG: 89 50 4E 47
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return "image/png";
  }

  // GIF: 47 49 46
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
    return "image/gif";
  }

  // WebP: RIFF ... WEBP
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return "image/webp";
  }

  return null;
}

/**
 * Uploads an image buffer to the authenticated user's Telegram Saved Messages ("me").
 * Adds the unique PixelVault identifier as the message caption.
 */
export async function uploadImageToTelegramSavedMessages(params: {
  encryptedSession: string;
  buffer: Buffer;
  fileName: string;
  caption: string;
}): Promise<string> {
  const { apiId, apiHash } = getTelegramConfig();
  const sessionString = decryptTelegramSession(params.encryptedSession);

  const client = new TelegramClient(
    new StringSession(sessionString),
    apiId,
    apiHash,
    { connectionRetries: 3 },
  );

  try {
    await client.connect();

    const isAuthorized = await client.checkAuthorization();
    if (!isAuthorized) {
      throw new Error("Telegram session is expired or invalid. Please log in again.");
    }

    const customFile = new CustomFile(
      params.fileName,
      params.buffer.length,
      "",
      params.buffer,
    );

    const message = await client.sendFile("me", {
      file: customFile,
      caption: params.caption,
    });

    if (!message || !message.id) {
      throw new Error("Telegram did not return a message ID for the uploaded media.");
    }

    return message.id.toString();
  } finally {
    await client.disconnect().catch(() => {});
  }
}

/**
 * Retrieves the raw image buffer from Telegram Saved Messages using the stored message ID.
 */
export async function downloadImageFromTelegram(params: {
  encryptedSession: string;
  messageId: string | number;
}): Promise<Buffer | null> {
  const { apiId, apiHash } = getTelegramConfig();
  const sessionString = decryptTelegramSession(params.encryptedSession);

  const client = new TelegramClient(
    new StringSession(sessionString),
    apiId,
    apiHash,
    { connectionRetries: 3 },
  );

  try {
    await client.connect();

    const isAuthorized = await client.checkAuthorization();
    if (!isAuthorized) {
      throw new Error("Telegram session is expired or invalid.");
    }

    const numericId = Number(params.messageId);
    if (!Number.isInteger(numericId) || numericId <= 0) {
      return null;
    }

    const messages = await client.getMessages("me", {
      ids: [numericId],
    });

    const message = messages?.[0];
    if (!message || !message.media) {
      return null;
    }

    const downloaded = await client.downloadMedia(message);
    if (!downloaded) {
      return null;
    }

    return Buffer.isBuffer(downloaded) ? downloaded : Buffer.from(downloaded);
  } finally {
    await client.disconnect().catch(() => {});
  }
}

/**
 * Deletes a message from Telegram Saved Messages (e.g. rollback after failed DB write or user delete).
 */
export async function deleteTelegramMessage(params: {
  encryptedSession: string;
  messageId: string | number;
}): Promise<boolean> {
  const { apiId, apiHash } = getTelegramConfig();
  const sessionString = decryptTelegramSession(params.encryptedSession);

  const client = new TelegramClient(
    new StringSession(sessionString),
    apiId,
    apiHash,
    { connectionRetries: 3 },
  );

  try {
    await client.connect();

    const numericId = Number(params.messageId);
    if (!Number.isInteger(numericId) || numericId <= 0) {
      return false;
    }

    await client.deleteMessages("me", [numericId], { revoke: true });
    return true;
  } catch (err) {
    console.error("Failed to delete Telegram message:", err);
    return false;
  } finally {
    await client.disconnect().catch(() => {});
  }
}
