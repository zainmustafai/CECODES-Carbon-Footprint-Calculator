import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth/server";
import { POST_LOGIN_PATH } from "@/lib/routes";

export default async function Home() {
  const user = await getUser();
  redirect(user ? POST_LOGIN_PATH : "/login");
}
