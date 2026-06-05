// Small shared form primitives for the behavior/combo editors.

export const inputCls =
  "w-full px-2.5 py-1.5 rounded-md text-sm bg-zmkay-panel border border-zmkay-edge text-zmkay-text font-mono focus:outline-none focus:border-zmkay-accent/60";

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-zmkay-muted">{label}</span>
      {children}
    </label>
  );
}

export function SubmitRow({ disabled, label }: { disabled: boolean; label: string }) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className="self-start mt-1 px-3 py-1.5 rounded-md text-sm bg-zmkay-accent/20 border border-zmkay-accent/50 text-zmkay-text hover:bg-zmkay-accent/30 disabled:opacity-40"
    >
      {label}
    </button>
  );
}
