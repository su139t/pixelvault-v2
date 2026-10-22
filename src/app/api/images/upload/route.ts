import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { getAuthenticatedUser } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import {
  deleteTelegramMessage,
  detectImageMimeType,
  uploadImageToTelegramSavedMessages,
} from "@/lib/telegram/storage";
import AIMetadata from "@/models/AIMetadata";
import Image from "@/models/Image";
import User from "@/models/User";

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB

export async function POST(request: Request) {
  try {
    await connectDB();

    const authUser = await getAuthenticatedUser();
    if (!authUser) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    }

    const userDoc = await User.findById(authUser._id).select(
      "+telegramSessionEncrypted",
    );

    if (!userDoc?.telegramSessionEncrypted) {
      return NextResponse.json(
        {
          error:
            "Telegram session not found. Please log in with Telegram first.",
        },
        { status: 400 },
      );
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json(
        { error: "Invalid form data payload" },
        { status: 400 },
      );
    }

    const file = formData.get("file");

    if (!file || typeof file === "string" || !(file instanceof Blob)) {
      return NextResponse.json(
        { error: "No image file provided in 'file' field" },
        { status: 400 },
      );
    }

    if (file.size <= 0) {
      return NextResponse.json(
        { error: "Uploaded file is empty" },
        { status: 400 },
      );
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: "File exceeds the 50MB limit" },
        { status: 400 },
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const detectedMime = detectImageMimeType(buffer);
    if (!detectedMime) {
      return NextResponse.json(
        {
          error:
            "Unsupported or corrupt image format. Allowed formats: JPEG, PNG, WebP, GIF.",
        },
        { status: 400 },
      );
    }

    const fileName =
      file instanceof File && file.name ? file.name.trim() : "unnamed-image";
    const uniqueId = `PIXELVAULT_${randomUUID()}`;
    const caption = uniqueId;

    let telegramMessageId: string;
    try {
      telegramMessageId = await uploadImageToTelegramSavedMessages({
        encryptedSession: userDoc.telegramSessionEncrypted,
        buffer,
        fileName,
        caption,
      });
    } catch (uploadError) {
      console.error(
        "Telegram media upload failed:",
        uploadError instanceof Error ? uploadError.message : uploadError,
      );

      return NextResponse.json(
        {
          error:
            "Failed to upload image to Telegram Saved Messages. Please ensure your Telegram session is active.",
        },
        { status: 502 },
      );
    }

    try {
      const newImage = await Image.create({
        userId: userDoc._id,
        uniqueId,
        caption,
        originalName: fileName.slice(0, 255),
        mimeType: detectedMime,
        sizeBytes: buffer.length,
        storage: {
          provider: "telegram",
          telegramMessageId,
          externalUrl: null,
        },
        tags: [],
        processingStatus: "pending",
      });

      // Decoupled AI metadata tracking
      await AIMetadata.create({
        userId: userDoc._id,
        imageId: newImage._id,
        processingStatus: "pending",
      }).catch((aiErr) => {
        console.warn("Could not create initial AIMetadata record:", aiErr);
      });

      return NextResponse.json(
        {
          success: true,
          image: {
            id: newImage._id.toString(),
            uniqueId: newImage.uniqueId,
            caption: newImage.caption,
            originalName: newImage.originalName,
            mimeType: newImage.mimeType,
            sizeBytes: newImage.sizeBytes,
            storage: newImage.storage,
            tags: newImage.tags,
            processingStatus: newImage.processingStatus,
            createdAt: newImage.createdAt,
          },
        },
        { status: 201 },
      );
    } catch (dbError) {
      console.error(
        "MongoDB write failed after Telegram upload, rolling back message:",
        dbError,
      );

      // Rollback orphaned message in Telegram Saved Messages
      await deleteTelegramMessage({
        encryptedSession: userDoc.telegramSessionEncrypted,
        messageId: telegramMessageId,
      }).catch(() => { });

      return NextResponse.json(
        { error: "Failed to persist image metadata" },
        { status: 500 },
      );
    }
  } catch (error) {
    console.error(
      "Unhandled upload error:",
      error instanceof Error ? error.message : "Unknown error",
    );

    return NextResponse.json(
      { error: "Internal server error during upload" },
      { status: 500 },
    );
  }
}
