// Renders a member's uploaded photo when they have one, falling back to the
// existing colored-initial badge everywhere else in the app already uses.
export default function Avatar({
  url, initial, color, size = 36, className = "",
}: {
  url?: string | null;
  initial: string;
  color: string;
  size?: number;
  className?: string;
}) {
  if (url) {
    return (
      <img
        src={url}
        alt={initial}
        className={`rounded-full object-cover shrink-0 ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className={`rounded-full flex items-center justify-center font-700 shrink-0 ${className}`}
      style={{ width: size, height: size, background: `${color}18`, color, fontSize: size * 0.4 }}
    >
      {initial}
    </div>
  );
}
