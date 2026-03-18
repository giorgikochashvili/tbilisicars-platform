import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-[80vh] w-full flex items-center justify-center bg-background">
      <Card className="w-full max-w-md border-border/50 bg-card/50 backdrop-blur-sm shadow-xl">
        <CardContent className="pt-8 pb-8 flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-6 border border-destructive/20">
            <AlertCircle className="h-8 w-8 text-destructive" />
          </div>
          <h1 className="text-3xl font-bold text-foreground font-display tracking-tight mb-2">404 Not Found</h1>
          <p className="text-muted-foreground font-medium">
            The module or page you are looking for does not exist or has been moved.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
