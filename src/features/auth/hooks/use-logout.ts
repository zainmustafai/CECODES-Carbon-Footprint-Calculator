"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";

export function useLogout() {
  const router = useRouter();
  const tt = useTranslations("auth.toasts");
  const [isPending, startTransition] = useTransition();

  function logout() {
    startTransition(async () => {
      const supabase = createClient();
      await supabase.auth.signOut();
      toast.success(tt("loggedOut"));
      router.push("/login");
      router.refresh();
    });
  }

  return { logout, isPending };
}
