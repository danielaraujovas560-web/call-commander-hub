import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { login } from "@/lib/auth/login.functions";
import { getStoredToken, setStoredToken } from "@/lib/auth/attach-auth";
import { ramalLogin } from "@/lib/auth/ramal-login.functions";
import { getStoredRamalCreds, setStoredRamalCreds } from "@/lib/auth/ramal-creds";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PhoneCall } from "lucide-react";

export const Route = createFileRoute("/auth")({
  ssr: false,
  beforeLoad: async () => {
    if (getStoredToken()) throw redirect({ to: "/dashboard" });
    if (getStoredRamalCreds()) throw redirect({ to: "/ramal" });
  },
  head: () => ({
    meta: [{ title: "Entrar — Painel PABX" }],
  }),
  component: AuthPage,
});

function AuthPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <PhoneCall className="h-6 w-6" />
          </div>
          <CardTitle>Painel PABX</CardTitle>
          <CardDescription>Acesse sua área para gerir ramais e relatórios</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="admin" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="admin">Administrador</TabsTrigger>
              <TabsTrigger value="ramal">Ramal</TabsTrigger>
            </TabsList>
            <TabsContent value="admin" className="pt-4">
              <AdminLoginForm />
            </TabsContent>
            <TabsContent value="ramal" className="pt-4">
              <RamalLoginForm />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

function AdminLoginForm() {
  const navigate = useNavigate();
  const loginFn = useServerFn(login);
  const [loading, setLoading] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPass, setLoginPass] = useState("");

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await loginFn({ data: { email: loginEmail, senha: loginPass } });
      setStoredToken(res.token);
      toast.success("Bem-vindo!");
      window.location.href = "/dashboard";
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Credenciais inválidas");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleLogin} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="login-email">E-mail</Label>
        <Input id="login-email" type="email" required value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="login-pass">Senha</Label>
        <Input id="login-pass" type="password" required value={loginPass} onChange={(e) => setLoginPass(e.target.value)} />
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Entrando..." : "Entrar"}
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        Acessos são criados pelo administrador.
      </p>
    </form>
  );
}

function RamalLoginForm() {
  const ramalLoginFn = useServerFn(ramalLogin);
  const [loading, setLoading] = useState(false);
  const [endpointId, setEndpointId] = useState("");
  const [senha, setSenha] = useState("");

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await ramalLoginFn({ data: { endpoint_id: endpointId, senha } });
      if (!res.wss_url) throw new Error("Servidor não configurado para WebRTC (wss_url ausente).");
      setStoredRamalCreds({
        sip_username: res.sip_username,
        sip_password: res.sip_password,
        wss_url: res.wss_url,
        sip_domain: res.sip_domain,
        nome: res.nome,
        ramal: res.ramal,
      });
      toast.success("Bem-vindo!");
      window.location.href = "/ramal";
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ramal ou senha inválidos");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleLogin} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="ramal-endpoint">Ramal</Label>
        <Input
          id="ramal-endpoint"
          value={endpointId}
          onChange={(e) => setEndpointId(e.target.value)}
          required
          placeholder="ex: 19999"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="ramal-senha">Senha</Label>
        <Input
          id="ramal-senha"
          type="password"
          required
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
        />
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Entrando..." : "Entrar"}
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        Use o mesmo número e senha configurados no seu ramal.
      </p>
    </form>
  );
}
