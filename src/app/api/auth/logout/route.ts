import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import connectDB from "@/lib/mongodb";
import { revokeWebSession } from "@/lib/web-session";

export async function POST() {
  try {
    await connectDB();

    const cookieStore = await cookies();
    const token = cookieStore.get("pv_session")?.value;

    if (token) {
      await revokeWebSession(token);
    }

    const response = NextResponse.json({
      success: true,
      message: "Logged out successfully",
    });

    response.cookies.set("pv_session", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });

    return response;
  } catch (error) {
    console.error(
      "Logout failed:",
      error instanceof Error ? error.message : "Unknown error",
    );

    return NextResponse.json({ error: "Logout failed" }, { status: 500 });
  }
}
