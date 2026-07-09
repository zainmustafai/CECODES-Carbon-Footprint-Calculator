import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const stack = [
  "Next.js 16",
  "React 19",
  "Tailwind v4",
  "shadcn/ui",
  "Recharts",
  "Supabase + RLS",
  "Prisma 7",
];

export default function Home() {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle className="text-2xl">CECODES · Huella de Carbono</CardTitle>
          <CardDescription>
            Calculadora de huella de carbono corporativa (Alcance 1, 2 y 3) y
            tablero de visualización. Andamiaje del proyecto listo.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            {stack.map((s) => (
              <Badge key={s} variant="secondary">
                {s}
              </Badge>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">
            Documentos del proyecto en <code>/docs</code>. Configura las
            variables de entorno copiando <code>.env.example</code> a{" "}
            <code>.env</code>.
          </p>
          <div>
            <Button>Comenzar</Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
