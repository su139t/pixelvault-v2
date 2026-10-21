import { NextResponse } from "next/server";

import {
  getAuthFlow,
  startPhoneLogin,
  startQrLogin,
  submitCode,
  submitPassword,
} from "@/lib/telegram-auth-flow";


export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (body.action === "startPhone") {
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

      const flow = await startPhoneLogin(phoneNumber.trim());

      return NextResponse.json({
        authId: flow.id,
        stage: flow.stage,
        error: flow.error,
      });
    }

    if (body.action === "startQr") {
      const flow = await startQrLogin();

      return NextResponse.json({
        authId: flow.id,
        stage: flow.stage,
        qrUrl: flow.qrUrl,
        error: flow.error,
      });
    }

    if (typeof body.authId !== "string") {
      return NextResponse.json(
        { error: "Login attempt not found. Please start again." },
        { status: 400 },
      );
    }

    const flow = getAuthFlow(body.authId);

    if (!flow) {
      return NextResponse.json(
        { error: "Login expired. Please start again." },
        { status: 400 },
      );
    }

    if (body.action === "verifyCode") {
      if (
        typeof body.code !== "string" ||
        !/^\d{4,8}$/.test(body.code.trim())
      ) {
        return NextResponse.json(
          { error: "Enter the Telegram verification code." },
          { status: 400 },
        );
      }

      if (!submitCode(flow, body.code.trim())) {
        return NextResponse.json(
          { error: "The login code is not being requested. Start again." },
          { status: 400 },
        );
      }

      return NextResponse.json({ success: true });
    }

    if (body.action === "verifyPassword") {
      if (
        typeof body.password !== "string" ||
        body.password.length === 0 ||
        body.password.length > 256
      ) {
        return NextResponse.json(
          { error: "Enter your Telegram 2FA password." },
          { status: 400 },
        );
      }

      if (!submitPassword(flow, body.password)) {
        return NextResponse.json(
          { error: "Password verification is not currently requested." },
          { status: 400 },
        );
      }

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch {
    return NextResponse.json(
      { error: "Could not process Telegram login." },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  const authId = new URL(request.url).searchParams.get("authId");

  if (!authId || !/^[a-f0-9]{64}$/.test(authId)) {
    return NextResponse.json(
      { error: "Invalid login attempt." },
      { status: 400 },
    );
  }

  const flow = getAuthFlow(authId);

  if (!flow) {
    return NextResponse.json(
      { error: "Login expired. Please start again." },
      { status: 404 },
    );
  }

  const response = NextResponse.json({
    stage: flow.stage,
    qrUrl: flow.qrUrl,
    passwordHint: flow.passwordHint,
    error: flow.error,
  });

  if (flow.stage === "completed" && flow.webToken) {
    response.cookies.set("pv_session", flow.webToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: new Date(flow.expiresAt),
    });
  }

  return response;
}
