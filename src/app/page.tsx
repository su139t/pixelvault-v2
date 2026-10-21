import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export const instant = false;

export default async function Home() {
  const cookieStore = await cookies();
  const token = cookieStore.get("pv_session")?.value;

  if (token) {
    redirect("/dashboard");
  } else {
    redirect("/login");
  }
}
