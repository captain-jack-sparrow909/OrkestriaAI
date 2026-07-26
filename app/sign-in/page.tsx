import {
  getAuthenticationProvider,
  getChatGPTUser,
} from "../chatgpt-auth";
import { AuthGateway } from "../components/AuthGateway";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Sign in",
  description: "Continue securely to your OrkestriaAI workspace.",
};

export default async function SignInPage() {
  const user = await getChatGPTUser();

  return (
    <AuthGateway
      mode="sign-in"
      provider={getAuthenticationProvider()}
      user={user}
    />
  );
}
