import dotenv from "dotenv";
dotenv.config();

import { TelegramClient } from "teleproto";
import { StringSession } from "teleproto/sessions";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { decryptTelegramSession } from "@/lib/telegram/session";

async function main() {
  const apiId = Number(process.env.TELEGRAM_API_ID);
  const apiHash = process.env.TELEGRAM_API_HASH;

  if (!Number.isInteger(apiId) || apiId <= 0 || !apiHash) {
    throw new Error("Check Telegram API credentials in .env.local");
  }

  // Load these after dotenv has read .env.local
  const { default: connectDB } = await import("@/lib/mongodb");
  const { default: User } = await import("@/models/User");

  const rl = createInterface({ input: stdin, output: stdout });
  let client: TelegramClient | undefined;

  try {
    const telegramUserId = (
      await rl.question("Telegram user ID to restore: ")
    ).trim();

    if (!/^\d+$/.test(telegramUserId)) {
      throw new Error("Enter a valid numeric Telegram user ID");
    }

    await connectDB();

    // select:false fields must be explicitly requested
    const user = await User.findOne({ telegramUserId }).select(
      "+telegramSessionEncrypted",
    );

    if (!user?.telegramSessionEncrypted) {
      throw new Error(
        "No encrypted session found for this user. Run the login test first.",
      );
    }

    const sessionString = decryptTelegramSession(user.telegramSessionEncrypted);

    client = new TelegramClient(
      new StringSession(sessionString),
      apiId,
      apiHash,
      { connectionRetries: 5 },
    );

    await client.connect();

    const authorized = await client.checkAuthorization();

    if (!authorized) {
      throw new Error("Saved Telegram session is not authorized. Login again.");
    }

    const me = await client.getMe();

    // Make sure the restored session belongs to the requested user.
    if (me.id.toString() !== telegramUserId) {
      throw new Error("Restored Telegram account ID does not match");
    }

    console.log("\nSaved Telegram session restored successfully!");
    console.log({
      telegramUserId: me.id.toString(),
      firstName: me.firstName ?? null,
      username: me.username ?? null,
      authorized: true,
    });
  } finally {
    if (client) {
      try {
        await client.disconnect();
      } catch {
        // Ignore cleanup errors.
      }
    }

    rl.close();
  }
}

main().catch((error) => {
  console.error(
    "Session restore failed:",
    error instanceof Error ? error.message : "Unknown error",
  );
  process.exitCode = 1;
});
