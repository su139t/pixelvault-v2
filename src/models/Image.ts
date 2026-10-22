import { Schema, model, models } from "mongoose";

const ImageSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    uniqueId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },

    caption: {
      type: String,
      required: true,
      trim: true,
      maxlength: 255,
    },

    originalName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 255,
    },

    mimeType: {
      type: String,
      required: true,
      enum: ["image/jpeg", "image/png", "image/webp", "image/gif"],
    },

    sizeBytes: {
      type: Number,
      required: true,
      min: 1,
    },

    storage: {
      provider: {
        type: String,
        enum: ["telegram", "cloudinary"],
        required: true,
      },

      telegramMessageId: {
        type: String,
        default: null,
      },

      externalUrl: {
        type: String,
        default: null,
      },
    },

    tags: {
      type: [String],
      default: [],
    },

    processingStatus: {
      type: String,
      enum: ["pending", "processing", "completed", "failed"],
      default: "pending",
      index: true,
    },
  },
  { timestamps: true },
);

ImageSchema.index({ userId: 1, createdAt: -1 });

const Image = models.Image || model("Image", ImageSchema);

export default Image;
