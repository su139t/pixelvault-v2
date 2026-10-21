import { Schema, model, models } from "mongoose";

const PendingTelegramAuthSchema = new Schema(
  {
    tokenHash: {
      type: String,
      required: true,
      unique: true,
      select: false,
    },

    phoneNumber: {
      type: String,
      required: true,
    },

    phoneCodeHashEncrypted: {
      type: String,
      required: true,
      select: false,
    },

    telegramSessionEncrypted: {
      type: String,
      required: true,
      select: false,
    },

    status: {
      type: String,
      enum: ["code_sent", "awaiting_2fa"],
      default: "code_sent",
      required: true,
    },

    attempts: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },

    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 },
    },
  },
  { timestamps: true },
);

const PendingTelegramAuth =
  models.PendingTelegramAuth ||
  model("PendingTelegramAuth", PendingTelegramAuthSchema);

export default PendingTelegramAuth;
