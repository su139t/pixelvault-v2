import { Schema, model, models } from "mongoose";

const UserSchema = new Schema(
  {
    telegramUserId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
    },
    username: {
      type: String,
      default: null,
      trim: true,
      maxlength: 150,
    },
    email: {
      type: String,
      default: null,
      trim: true,
      maxlength: 255,
    },
    telegramSessionEncrypted: {
      type: String,
      default: null,
      select: false,
    },
    profilePhotoData: {
      type: Buffer,
      default: null,
      select: false,
    },
    profilePhotoMimeType: {
      type: String,
      enum: ["image/jpeg", "image/png", "image/webp", "image/gif"],
      default: null,
      select: false,
    },
  },
  {
    timestamps: true,
  },
);

const User = models.User || model("User", UserSchema);

export default User;
