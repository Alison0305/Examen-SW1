"use client";

import { CssBaseline, ThemeProvider, createTheme } from "@mui/material";
import { SessionProvider } from "./auth/session";

const theme = createTheme({
  palette: {
    mode: "light",
    background: {
      default: "#f5f7fb",
    },
    primary: {
      main: "#0f4c81",
    },
  },
  shape: {
    borderRadius: 10,
  },
});

export function AppProviders({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <SessionProvider>{children}</SessionProvider>
    </ThemeProvider>
  );
}
