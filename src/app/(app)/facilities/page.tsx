import { redirect } from "next/navigation";

// Sedes management folded into the company page; this route stays as a permanent redirect so
// old bookmarks and in-app links keep working.
export default async function Page() {
  redirect("/company");
}
