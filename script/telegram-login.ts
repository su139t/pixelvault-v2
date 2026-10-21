import "dotenv/config";

import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

import { TelegramClient } from "teleproto";
import { StringSession } from "teleproto/sessions";

import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { encryptTelegramSession } from "@/lib/telegram-session";

async function main() {
  const rl = createInterface({ input: stdin, output: stdout });

  const apiId = Number(process.env.TELEGRAM_API_ID);
  const apiHash = process.env.TELEGRAM_API_HASH;

  if (!Number.isSafeInteger(apiId) || apiId <= 0 || !apiHash) {
    throw new Error("Telegram API configuration is missing");
  }

  const client = new TelegramClient(new StringSession(""), apiId, apiHash, {
    connectionRetries: 5,
  });

  try {
    await client.start({
      phoneNumber: () => rl.question("Telegram phone number (+country code): "),

      phoneCode: () => rl.question("Telegram login code: "),

      password: (hint) =>
        rl.question(`Telegram 2FA password${hint ? ` (hint: ${hint})` : ""}: `),

      emailAddress: () => rl.question("Telegram recovery email: "),

      emailVerification: async () => ({
        type: "code",
        code: await rl.question("Email verification code: "),
      }),

      onError: () => {
        console.error("Telegram authentication step failed.");
      },
    });

    const me = await client.getMe();

    await connectDB();

    const telegramUserId = me.id.toString();
    const name =
      [me.firstName, me.lastName].filter(Boolean).join(" ").trim() ||
      me.username ||
      "Telegram User";

    const encryptedSession = encryptTelegramSession(client.session.save());

    await User.findOneAndUpdate(
      { telegramUserId },
      {
        $set: {
          name,
          username: me.username ?? null,
          telegramSessionEncrypted: encryptedSession,
        },
      },
      {
        upsert: true,
        returnDocument: "after",
        runValidators: true,
        setDefaultsOnInsert: true,
      },
    );

    console.log(
      "Telegram authentication and encrypted session save succeeded.",
    );
    console.log("Username:", me.username ?? "(no username)");
  } finally {
    await client.disconnect().catch(() => {});
    rl.close();
  }
}

main().catch((error) => {
  console.error(
    "Login failed:",
    error instanceof Error ? error.message : "Unknown error",
  );
  process.exitCode = 1;
});
