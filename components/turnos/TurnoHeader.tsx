import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CalendarIcon } from "lucide-react";

export function TurnoHeader() {
  return (
    <CardHeader className="space-y-4 text-center pb-8 border-b border-border/50">
      <div className="inline-flex items-center justify-center w-16 h-16 mx-auto rounded-full bg-gradient-to-br from-primary/20 to-primary/10 ring-4 ring-primary/10">
        <CalendarIcon className="h-8 w-8 text-primary" />
      </div>
      <CardTitle className="text-3xl md:text-4xl font-bold bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent">
        Agendar Turno
      </CardTitle>
      <CardDescription className="text-base md:text-lg max-w-2xl mx-auto">
        Completa el formulario y nos pondremos en contacto para confirmar tu
        turno
      </CardDescription>
    </CardHeader>
  );
}
