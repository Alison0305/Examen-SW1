"use client";

import { Box, CircularProgress } from "@mui/material";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useSession } from "./session";

export function ProtectedPage({ children }: Readonly<{ children: ReactNode }>) {
  const { status } = useSession();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    if (status === "anonymous") {
      const query = searchParams.toString();
      router.replace(`/login?returnTo=${encodeURIComponent(`${pathname}${query ? `?${query}` : ""}`)}`);
    }
  }, [pathname, router, searchParams, status]);

  if (status !== "authenticated") {
    return <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center" }}><CircularProgress aria-label="Cargando sesión" /></Box>;
  }
  return <>{children}</>;
}
