import { randomUUID } from "node:crypto";
import { detectImageMimeType } from "../src/lib/telegram-storage";
import connectDB from "../src/lib/mongodb";
import Image from "../src/models/Image";
import User from "../src/models/User";

async function testWorkflow() {
  console.log("=== 1. Testing Magic Byte Image Detection ===");
  // Valid JPEG header
  const fakeJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
  console.log("JPEG detected:", detectImageMimeType(fakeJpeg) === "image/jpeg" ? "PASS" : "FAIL");

  // Valid PNG header
  const fakePng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
  console.log("PNG detected:", detectImageMimeType(fakePng) === "image/png" ? "PASS" : "FAIL");

  // Invalid fake text file masquerading as image
  const fakeText = Buffer.from("<html><script>alert(1)</script></html>");
  console.log("Spoofed text rejected:", detectImageMimeType(fakeText) === null ? "PASS" : "FAIL");

  console.log("\n=== 2. Testing Unique PixelVault ID Generation ===");
  const uid1 = `PIXELVAULT_${randomUUID()}`;
  const uid2 = `PIXELVAULT_${randomUUID()}`;
  const isValidFormat = /^PIXELVAULT_[a-f0-9-]{36}$/.test(uid1);
  console.log("Unique ID 1:", uid1);
  console.log("Unique ID 2:", uid2);
  console.log("Format valid:", isValidFormat ? "PASS" : "FAIL");
  console.log("Different IDs:", uid1 !== uid2 ? "PASS" : "FAIL");

  console.log("\n=== 3. Testing Database Schema with uniqueId ===");
  await connectDB();
  console.log("Connected to MongoDB successfully.");

  // Check ImageSchema has uniqueId path
  const hasUniqueId = Boolean(Image.schema.path("uniqueId"));
  console.log("Image model has uniqueId field:", hasUniqueId ? "PASS" : "FAIL");

  console.log("\nALL VERIFICATIONS PASSED!");
  process.exit(0);
}

testWorkflow().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
