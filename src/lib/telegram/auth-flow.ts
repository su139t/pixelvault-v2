import { randomBytes } from "node:crypto";
import { TelegramClient } from "teleproto";
import { StringSession } from "teleproto/sessions";

import connectDB from "@/lib/mongodb";
import { encryptTelegramSession } from "@/lib/telegram/session";
import { createWebSession } from "@/lib/web-session";
import User from "@/models/User";

export type AuthStage =
  | "starting"
  | "awaiting_code"
  | "awaiting_password"
  | "qr_ready"
  | "verifying"
  | "completed"
  | "failed";

export type AuthFlow = {
  id: string;
  client: TelegramClient;
  stage: AuthStage;
  qrUrl?: string;
  expiresAt: number;
  error?: string;
  passwordHint?: string;
  webToken?: string;
  resolveCode?: (value: string) => void;
  resolvePassword?: (value: string) => void;
  signalReady?: () => void;
};

const globalFlows = globalThis as typeof globalThis & {
  __pixelVaultAuthFlows?: Map<string, AuthFlow>;
};

export const authFlows = (globalFlows.__pixelVaultAuthFlows ??= new Map<
  string,
  AuthFlow
>());

function createFlow(): AuthFlow {
  const apiId = Number(process.env.TELEGRAM_API_ID);
  const apiHash = process.env.TELEGRAM_API_HASH;

  if (!Number.isSafeInteger(apiId) || apiId <= 0 || !apiHash) {
    throw new Error("Telegram API configuration is missing.");
  }

  const id = randomBytes(32).toString("hex");

  const flow: AuthFlow = {
    id,
    client: new TelegramClient(new StringSession(""), apiId, apiHash, {
      connectionRetries: 3,
    }),
    stage: "starting",
    expiresAt: Date.now() + 10 * 60 * 1000,
  };

  // Remove expired login attempts.
  for (const [key, value] of authFlows) {
    if (value.expiresAt < Date.now()) {
      value.client.disconnect().catch(() => {});
      authFlows.delete(key);
    }
  }

  authFlows.set(id, flow);
  return flow;
}

export function getAuthFlow(id: string) {
  const flow = authFlows.get(id);

  if (!flow || flow.expiresAt < Date.now()) {
    if (flow) authFlows.delete(id);
    return null;
  }

  return flow;
}

async function saveLoggedInUser(flow: AuthFlow) {
  const me = await flow.client.getMe();
  const sessionString = flow.client.session.save();

  if (typeof sessionString !== "string") {
    throw new Error("Could not save Telegram session.");
  }

  await connectDB();

  const telegramUserId = me.id.toString();
  const name =
    [me.firstName, me.lastName].filter(Boolean).join(" ").trim() ||
    me.username ||
    "Telegram User";

  const user = await User.findOneAndUpdate(
    { telegramUserId },
    {
      $set: {
        name,
        username: me.username ?? null,
        telegramSessionEncrypted: encryptTelegramSession(sessionString),
      },
    },
    {
      upsert: true,
      returnDocument: "after",
      runValidators: true,
      setDefaultsOnInsert: true,
    },
  );

  if (!user) throw new Error("Could not save user.");

  const webSession = await createWebSession(user._id);

  flow.webToken = webSession.token;
  flow.expiresAt = webSession.expiresAt.getTime();
  flow.stage = "completed";
  flow.error = undefined;
}

async function runPhoneLogin(flow: AuthFlow, phoneNumber: string) {
  let signalReady!: () => void;
  const ready = new Promise<void>((resolve) => {
    signalReady = resolve;
  });
  flow.signalReady = signalReady;

  void (async () => {
    try {
      await flow.client.start({
        phoneNumber: async () => phoneNumber,

        phoneCode: async () => {
          flow.stage = "awaiting_code";
          flow.signalReady?.();
          flow.signalReady = undefined;

          return new Promise<string>((resolve) => {
            flow.resolveCode = resolve;
          });
        },

        password: async (hint) => {
          flow.stage = "awaiting_password";
          flow.passwordHint = hint || undefined;

          return new Promise<string>((resolve) => {
            flow.resolvePassword = resolve;
          });
        },

        onError: async (error: Error): Promise<boolean> => {
          const msg = error.message || String(error);
          if (/PHONE_CODE_INVALID/i.test(msg)) {
            flow.error = "Invalid verification code. Please check and try again.";
            flow.stage = "awaiting_code";
            return false;
          }
          if (/PASSWORD_HASH_INVALID/i.test(msg)) {
            flow.error = "Incorrect 2FA password. Please try again.";
            flow.stage = "awaiting_password";
            return false;
          }
          flow.error = "The code or password was rejected. Please try again.";
          return true;
        },
      });

      await saveLoggedInUser(flow);
    } catch (err) {
      flow.stage = "failed";
      flow.error =
        flow.error ||
        (err instanceof Error
          ? err.message
          : "Telegram login failed. Please start again.");
      flow.signalReady?.();
    } finally {
      await flow.client.disconnect().catch(() => {});
    }
  })();

  await Promise.race([
    ready,
    new Promise<void>((resolve) => setTimeout(resolve, 25000)),
  ]);

  return flow;
}

async function runQrLogin(flow: AuthFlow) {
  let signalReady!: () => void;
  const ready = new Promise<void>((resolve) => {
    signalReady = resolve;
  });
  flow.signalReady = signalReady;

  void (async () => {
    try {
      await flow.client.connect();

      await flow.client.signInUserWithQrCode(
        {
          apiId: Number(process.env.TELEGRAM_API_ID),
          apiHash: process.env.TELEGRAM_API_HASH!,
        },
        {
          qrCode: async ({ token }) => {
            flow.qrUrl = `tg://login?token=${token.toString("base64url")}`;
            flow.stage = "qr_ready";
            flow.signalReady?.();
            flow.signalReady = undefined;
          },

          password: async (hint) => {
            flow.stage = "awaiting_password";
            flow.passwordHint = hint || undefined;

            return new Promise<string>((resolve) => {
              flow.resolvePassword = resolve;
            });
          },

          onError: async (err: Error): Promise<boolean> => {
            const msg = err?.message || String(err);
            if (/PASSWORD_HASH_INVALID/i.test(msg)) {
              flow.error = "Incorrect 2FA password. Please try again.";
              flow.stage = "awaiting_password";
              return false;
            }
            flow.error = "QR login failed. Please start again.";
            return true;
          },
        },
      );

      await saveLoggedInUser(flow);
    } catch (err) {
      flow.stage = "failed";
      flow.error =
        flow.error ||
        (err instanceof Error
          ? err.message
          : "QR login expired or failed. Please try again.");
      flow.signalReady?.();
    } finally {
      await flow.client.disconnect().catch(() => {});
    }
  })();

  await Promise.race([
    ready,
    new Promise<void>((resolve) => setTimeout(resolve, 25000)),
  ]);

  return flow;
}

export async function startPhoneLogin(phoneNumber: string) {
  const flow = createFlow();
  return runPhoneLogin(flow, phoneNumber);
}

export async function startQrLogin() {
  const flow = createFlow();
  return runQrLogin(flow);
}

export function submitCode(flow: AuthFlow, code: string) {
  if (flow.stage !== "awaiting_code" || !flow.resolveCode) return false;

  const resolve = flow.resolveCode;
  flow.resolveCode = undefined;
  flow.error = undefined;
  flow.stage = "verifying";
  resolve(code);
  return true;
}

export function submitPassword(flow: AuthFlow, password: string) {
  if (flow.stage !== "awaiting_password" || !flow.resolvePassword) {
    return false;
  }

  const resolve = flow.resolvePassword;
  flow.resolvePassword = undefined;
  flow.error = undefined;
  flow.stage = "verifying";
  resolve(password);
  return true;
}
