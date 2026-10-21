import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { Api, TelegramClient } from "teleproto";
import { StringSession } from "teleproto/sessions";

import connectDB from "@/lib/mongodb";
import {
  decryptTelegramSession,
  encryptTelegramSession,
} from "@/lib/telegram-session";
import { createWebSession } from "@/lib/web-session";
import PendingTelegramAuth from "@/models/PendingTelegramAuth";
import User from "@/models/User";


export async function POST(request: Request) {
  let client: TelegramClient | null = null;

  try {
    const body = await request.json();
    const { authId, code } = body;

    if (
      typeof authId !== "string" ||
      !/^[a-f0-9]{64}$/.test(authId) ||
      typeof code !== "string" ||
      !/^\d{4,8}$/.test(code.trim())
    ) {
      return NextResponse.json(
        { error: "Enter a valid login code." },
        { status: 400 },
      );
    }

    await connectDB();

    const tokenHash = createHash("sha256").update(authId).digest("hex");

    const pending = await PendingTelegramAuth.findOne({
      tokenHash,
      status: "code_sent",
      expiresAt: { $gt: new Date() },
      attempts: { $lt: 5 },
    }).select("+tokenHash +phoneCodeHashEncrypted +telegramSessionEncrypted");

    if (!pending) {
      return NextResponse.json(
        { error: "Login expired. Please start again." },
        { status: 400 },
      );
    }

    const apiId = Number(process.env.TELEGRAM_API_ID);
    const apiHash = process.env.TELEGRAM_API_HASH;

    if (!Number.isSafeInteger(apiId) || apiId <= 0 || !apiHash) {
      throw new Error("Telegram API configuration is missing.");
    }

    const phoneCodeHash = decryptTelegramSession(
      pending.phoneCodeHashEncrypted,
    );

    const sessionString = decryptTelegramSession(
      pending.telegramSessionEncrypted,
    );

    client = new TelegramClient(
      new StringSession(sessionString),
      apiId,
      apiHash,
      { connectionRetries: 3 },
    );

    await client.connect();

    try {
      await client.invoke(
        new Api.auth.SignIn({
          phoneNumber: pending.phoneNumber,
          phoneCodeHash,
          phoneCode: code.trim(),
        }),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (/SESSION_PASSWORD_NEEDED|PASSWORD_NEEDED/i.test(message)) {
        pending.status = "awaiting_2fa";
        pending.telegramSessionEncrypted = encryptTelegramSession(
          client.session.save() || sessionString,
        );
        await pending.save();

        return NextResponse.json({
          success: false,
          requiresPassword: true,
          message: "Telegram two-step verification is required.",
        });
      }

      pending.attempts += 1;

      if (pending.attempts >= 5) {
        await pending.deleteOne();
      } else {
        await pending.save();
      }

      return NextResponse.json(
        { error: "Invalid or expired code. Please try again." },
        { status: 400 },
      );
    }

    const me = await client.getMe();

    const telegramUserId = me.id.toString();
    const name =
      [me.firstName, me.lastName].filter(Boolean).join(" ").trim() ||
      me.username ||
      "Telegram User";

    const sessionStringAfterLogin = client.session.save();

    if (typeof sessionStringAfterLogin !== "string") {
      throw new Error("Could not save Telegram session.");
    }

    const user = await User.findOneAndUpdate(
      { telegramUserId },
      {
        $set: {
          name,
          username: me.username ?? null,
          telegramSessionEncrypted: encryptTelegramSession(
            sessionStringAfterLogin,
          ),
        },
      },
      {
        upsert: true,
        returnDocument: "after",
        runValidators: true,
        setDefaultsOnInsert: true,
      },
    );

    if (!user) {
      throw new Error("Could not save user.");
    }

    const webSession = await createWebSession(user._id);

    await pending.deleteOne();

    const response = NextResponse.json({
      success: true,
      message: "Telegram login successful.",
    });

    response.cookies.set("pv_session", webSession.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: webSession.expiresAt,
    });

    return response;
  } catch (error) {
    console.error(
      "Telegram OTP verification failed:",
      error instanceof Error ? error.message : "Unknown error",
    );

    return NextResponse.json(
      { error: "Could not verify the login code." },
      { status: 500 },
    );
  } finally {
    if (client) {
      await client.disconnect().catch(() => {});
    }
  }
}
