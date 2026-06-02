export default function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="grid min-h-[60vh] place-items-center text-sm text-ink/50">
      <div className="flex items-center gap-2">
        <span className="h-3 w-3 animate-pulse rounded-full bg-ink/30" />
        {label}
      </div>
    </div>
  );
}
