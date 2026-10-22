import { NextResponse } from "next/server";

import { getAuthenticatedUser } from "@/lib/auth";
import { downloadTelegramProfilePhoto } from "@/lib/telegram/storage";
import User from "@/models/User";

export async function GET() {
  try {
    const authUser = await getAuthenticatedUser();
    if (!authUser) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    }

    const user = await User.findById(authUser._id).select(
      "+telegramSessionEncrypted +profilePhotoData +profilePhotoMimeType",
    );

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (user.profilePhotoData && user.profilePhotoMimeType) {
      return new Response(new Uint8Array(user.profilePhotoData), {
        headers: {
          "Content-Type": user.profilePhotoMimeType,
          "Cache-Control": "private, max-age=3600",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

    if (!user.telegramSessionEncrypted) {
      return new Response(null, { status: 404 });
    }

    const profilePhoto = await downloadTelegramProfilePhoto({
      encryptedSession: user.telegramSessionEncrypted,
    });

    if (!profilePhoto) {
      return new Response(null, {
        status: 404,
        headers: { "Cache-Control": "private, no-store" },
      });
    }

    user.profilePhotoData = profilePhoto.buffer;
    user.profilePhotoMimeType = profilePhoto.mimeType;
    await user.save();

    return new Response(new Uint8Array(profilePhoto.buffer), {
      headers: {
        "Content-Type": profilePhoto.mimeType,
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error(
      "Telegram profile photo retrieval failed:",
      error instanceof Error ? error.message : "Unknown error",
    );

    return NextResponse.json(
      { error: "Unable to load profile photo" },
      { status: 502 },
    );
  }
}
