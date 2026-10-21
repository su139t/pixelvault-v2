import { cookies } from "next/headers";

import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { verifyWebSession } from "@/lib/web-session";

export async function getAuthenticatedUser() {
  await connectDB();

  const cookieStore = await cookies();
  const token = cookieStore.get("pv_session")?.value;

  if (!token) return null;

  const session = await verifyWebSession(token);

  if (!session) return null;

  const user = await User.findById(session.userId)
    .select("_id name username email")
    .lean();

  return user ?? null;
}
