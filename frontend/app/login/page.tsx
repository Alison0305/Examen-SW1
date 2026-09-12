import { AuthForm } from "../auth/auth-form";
import { Suspense } from "react";

export default function LoginPage() {
  return <Suspense><AuthForm mode="login" /></Suspense>;
}
