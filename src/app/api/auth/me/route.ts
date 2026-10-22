import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import connectDB from "@/lib/mongodb";
import { isTelegramSessionAuthorized } from "@/lib/telegram/storage";
import User from "@/models/User";
import {
  revokeWebSession,
  revokeWebSessionsForUser,
  verifyWebSession,
} from "@/lib/web-session";

function clearSessionCookie(response: NextResponse) {
  response.cookies.set("pv_session", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}

export async function GET() {
  try {
    await connectDB();

    const cookieStore = await cookies();
    const token = cookieStore.get("pv_session")?.value;

    if (!token) {
      return NextResponse.json({ user: null });
    }

    const session = await verifyWebSession(token);

    if (!session) {
      return clearSessionCookie(NextResponse.json({ user: null }));
    }

    const user = await User.findById(session.userId)
      .select("name username email createdAt +telegramSessionEncrypted");

    if (!user?.telegramSessionEncrypted) {
      await revokeWebSession(token);
      return clearSessionCookie(NextResponse.json({ user: null }));
    }

    const telegramSessionIsAuthorized =
      await isTelegramSessionAuthorized(user.telegramSessionEncrypted);

    if (!telegramSessionIsAuthorized) {
      await revokeWebSessionsForUser(user._id);
      return clearSessionCookie(NextResponse.json({ user: null }));
    }

    return NextResponse.json({
      user: {
        id: user._id.toString(),
        name: user.name,
        username: user.username,
        email: user.email,
      },
    });
  } catch (error) {
    console.error(
      "Current-user lookup failed:",
      error instanceof Error ? error.message : "Unknown error",
    );

    return NextResponse.json(
      { error: "Unable to check login status" },
      { status: 500 },
    );
  }
}
