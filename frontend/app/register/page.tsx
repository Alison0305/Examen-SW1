import { AuthForm } from "../auth/auth-form";
import { Suspense } from "react";

export default function RegisterPage() {
  return <Suspense><AuthForm mode="register" /></Suspense>;
}
