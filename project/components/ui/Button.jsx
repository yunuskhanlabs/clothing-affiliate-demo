import Link from "next/link";

const base =
  "inline-flex items-center justify-center gap-2 font-body text-sm font-semibold tracking-wide uppercase transition-all duration-300 ease-premium select-none";

const variants = {
  primary:
    "bg-tag text-ink px-8 py-4 hover:bg-tag-hover hover:scale-[1.05] active:scale-[0.98] rounded-sm",
  secondary:
    "border border-border-strong text-paper px-8 py-4 hover:border-paper hover:scale-[1.03] active:scale-[0.98] rounded-sm",
  ghost: "text-paper px-2 py-1 hover:text-tag",
};

export default function Button({
  as = "button",
  href,
  variant = "primary",
  className = "",
  children,
  ...props
}) {
  const classes = `${base} ${variants[variant] || variants.primary} ${className}`;

  if (as === "link" || href) {
    return (
      <Link href={href || "#"} className={classes} {...props}>
        {children}
      </Link>
    );
  }

  return (
    <button className={classes} {...props}>
      {children}
    </button>
  );
}
