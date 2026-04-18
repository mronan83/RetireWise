import { HelpContent } from "./help-content";

export default function HelpPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Help Center</h1>
        <p className="text-muted-foreground">
          Learn how RetireWise works — calculations, features, and tips
        </p>
      </div>
      <HelpContent />
    </div>
  );
}
