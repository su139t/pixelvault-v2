import { NextResponse } from "next/server";

import { getAuthenticatedUser } from "@/lib/auth";
import Image from "@/models/Image";
import AIMetadata from "@/models/AIMetadata";

export async function GET() {
  try {
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    }

    const images = await Image.find({ userId: user._id })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    const imageIds = images.map((image) => image._id);

    const metadata = await AIMetadata.find({
      userId: user._id,
      imageId: { $in: imageIds },
    })
      .select("imageId ocrText description processingStatus")
      .lean();

    const metadataByImageId = new Map(
      metadata.map((item) => [item.imageId.toString(), item]),
    );

    const results = images.map((image) => ({
      id: image._id.toString(),
      uniqueId: image.uniqueId,
      originalName: image.originalName,
      mimeType: image.mimeType,
      sizeBytes: image.sizeBytes,
      storage: image.storage,
      tags: image.tags,
      processingStatus: image.processingStatus,
      createdAt: image.createdAt,
      ai: metadataByImageId.get(image._id.toString()) ?? null,
    }));

    return NextResponse.json({ images: results });
  } catch (error) {
    console.error(
      "Image listing failed:",
      error instanceof Error ? error.message : "Unknown error",
    );

    return NextResponse.json(
      { error: "Unable to load images" },
      { status: 500 },
    );
  }
}
