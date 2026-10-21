import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { TelegramClient } from "teleproto";
import { StringSession } from "teleproto/sessions";

import connectDB from "@/lib/mongodb";
import { encryptTelegramSession } from "@/lib/telegram-session";
import PendingTelegramAuth from "@/models/PendingTelegramAuth";

export async function POST(request: Request) {
  let client: TelegramClient | null = null;

  try {
    const body = await request.json();
    const phoneNumber = body.phoneNumber;

    if (
      typeof phoneNumber !== "string" ||
      !/^\+[1-9]\d{7,14}$/.test(phoneNumber.trim())
    ) {
      return NextResponse.json(
        { error: "Enter a valid phone number with country code." },
        { status: 400 },
      );
    }

    const apiId = Number(process.env.TELEGRAM_API_ID);
    const apiHash = process.env.TELEGRAM_API_HASH;

    if (!Number.isSafeInteger(apiId) || apiId <= 0 || !apiHash) {
      throw new Error("Telegram API configuration is missing.");
    }

    await connectDB();

    client = new TelegramClient(new StringSession(""), apiId, apiHash, {
      connectionRetries: 3,
    });

    await client.connect();

    const result = await client.sendCode(
      { apiId, apiHash },
      phoneNumber.trim(),
    );

    const authId = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(authId).digest("hex");
    const sessionString = client.session.save();

    if (typeof sessionString !== "string") {
      throw new Error("Could not save Telegram session.");
    }
    await PendingTelegramAuth.create({
      tokenHash,
      phoneNumber: phoneNumber.trim(),
      phoneCodeHashEncrypted: encryptTelegramSession(result.phoneCodeHash),
      telegramSessionEncrypted: encryptTelegramSession(sessionString),
      status: "code_sent",
      attempts: 0,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });

    return NextResponse.json({
      success: true,
      authId,
      message: "Telegram login code requested successfully.",
      codeSentViaApp: result.isCodeViaApp,
    });
  } catch (error) {
    console.error(
      "Telegram login start failed:",
      error instanceof Error ? error.message : "Unknown error",
    );

    return NextResponse.json(
      { error: "Could not start Telegram login. Please try again." },
      { status: 500 },
    );
  } finally {
    if (client) {
      await client.disconnect().catch(() => {});
    }
  }
}
