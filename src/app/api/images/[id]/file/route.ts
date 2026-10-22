import { isValidObjectId } from "mongoose";
import { NextResponse } from "next/server";

import { getAuthenticatedUser } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import { downloadImageFromTelegram } from "@/lib/telegram/storage";
import Image from "@/models/Image";
import User from "@/models/User";

export async function GET(
  request: Request,
  props: { params: Promise<{ id: string }> },
) {
  try {
    await connectDB();

    const authUser = await getAuthenticatedUser();
    if (!authUser) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    }

    const { id } = await props.params;

    if (!isValidObjectId(id)) {
      return NextResponse.json(
        { error: "Invalid image identifier" },
        { status: 400 },
      );
    }

    // Enforce strict ownership: user can ONLY access their own image
    const image = await Image.findOne({
      _id: id,
      userId: authUser._id,
    }).lean();

    if (!image) {
      return NextResponse.json(
        { error: "Image not found or access denied" },
        { status: 404 },
      );
    }

    if (
      image.storage?.provider !== "telegram" ||
      !image.storage?.telegramMessageId
    ) {
      return NextResponse.json(
        { error: "Image storage provider is not configured for Telegram retrieval" },
        { status: 400 },
      );
    }

    const userDoc = await User.findById(authUser._id).select(
      "+telegramSessionEncrypted",
    );

    if (!userDoc?.telegramSessionEncrypted) {
      return NextResponse.json(
        { error: "Telegram session not found. Please log in again." },
        { status: 400 },
      );
    }

    const buffer = await downloadImageFromTelegram({
      encryptedSession: userDoc.telegramSessionEncrypted,
      messageId: image.storage.telegramMessageId,
    });

    if (!buffer) {
      return NextResponse.json(
        { error: "Image file is unavailable or was removed from Telegram Saved Messages" },
        { status: 404 },
      );
    }

    const url = new URL(request.url);
    const isDownload = url.searchParams.get("download") === "true";

    const dispositionType = isDownload ? "attachment" : "inline";
    const safeFilename = encodeURIComponent(image.originalName || "image");

    return new Response(buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": image.mimeType || "image/jpeg",
        "Content-Length": buffer.length.toString(),
        "Content-Disposition": `${dispositionType}; filename="${safeFilename}"`,
        "Cache-Control": "private, max-age=86400, stale-while-revalidate=3600",
      },
    });
  } catch (error) {
    console.error(
      "Image retrieval error:",
      error instanceof Error ? error.message : "Unknown error",
    );

    return NextResponse.json(
      { error: "Failed to retrieve image" },
      { status: 500 },
    );
  }
}
