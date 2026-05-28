import { Button } from "@/components/ui/button";

interface TurnoSubmitButtonProps {
  loading: boolean;
}

export function TurnoSubmitButton({ loading }: TurnoSubmitButtonProps) {
  return (
    <div className="pt-4">
      <Button
        type="submit"
        className="w-full h-12 text-base md:text-lg font-semibold shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105 bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary disabled:opacity-50 disabled:cursor-not-allowed"
        disabled={loading}
      >
        {loading ? (
          <span className="flex items-center gap-2">
            <div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            Agendando...
          </span>
        ) : (
          "Agendar Turno"
        )}
      </Button>
    </div>
  );
}