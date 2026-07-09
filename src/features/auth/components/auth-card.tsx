import * as React from "react";

type AuthCardProps = {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
};

// Presentational shell for auth screens. Fills the form panel (no fixed width cap);
// the surrounding layout controls how much horizontal space it occupies.
export function AuthCard({ title, subtitle, children, footer }: AuthCardProps) {
  return (
    <div className="w-full space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle ? <p className="text-muted-foreground">{subtitle}</p> : null}
      </div>
      {children}
      {footer ? <div className="text-sm text-muted-foreground">{footer}</div> : null}
    </div>
  );
}
