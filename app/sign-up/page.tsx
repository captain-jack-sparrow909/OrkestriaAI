import {
  getAuthenticationProvider,
  getChatGPTUser,
} from "../chatgpt-auth";
import { AuthGateway } from "../components/AuthGateway";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Create account",
  description: "Create secure access to your OrkestriaAI workspace.",
};

export default async function SignUpPage() {
  const user = await getChatGPTUser();

  return (
    <AuthGateway
      mode="sign-up"
      provider={getAuthenticationProvider()}
      user={user}
    />
  );
}
