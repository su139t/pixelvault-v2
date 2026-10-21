import { Schema, model, models } from "mongoose";

const AIMetadataSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    imageId: {
      type: Schema.Types.ObjectId,
      ref: "Image",
      required: true,
      unique: true,
    },

    ocrText: {
      type: String,
      default: "",
    },

    description: {
      type: String,
      default: "",
    },

    modelName: {
      type: String,
      default: null,
    },

    processingStatus: {
      type: String,
      enum: ["pending", "processing", "completed", "failed"],
      default: "pending",
      index: true,
    },

    errorMessage: {
      type: String,
      default: null,
    },

    processedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

AIMetadataSchema.index({ userId: 1, processingStatus: 1 });

const AIMetadata = models.AIMetadata || model("AIMetadata", AIMetadataSchema);

export default AIMetadata;
