import { redirect } from "next/navigation";
import { FEATURE_SELF_ONBOARDING } from "@/lib/feature-flags";
import { RegisterScreen } from "@/features/auth";

export default function Page() {
  // While registration is closed the middleware already bounces anonymous visitors, but a
  // signed-in user is no longer caught there once /register leaves the public list, so the
  // page guards itself too.
  if (!FEATURE_SELF_ONBOARDING) redirect("/login");
  return <RegisterScreen />;
}
