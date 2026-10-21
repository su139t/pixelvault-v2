import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    { message: "QR authentication is handled via POST /api/auth/telegram" },
    { status: 200 },
  );
}
