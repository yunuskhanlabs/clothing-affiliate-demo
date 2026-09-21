export default function Rating({ rating, reviewCount, size = "sm" }) {
  const starSize = size === "lg" ? "h-4 w-4" : "h-3 w-3";
  return (
    <div className="flex items-center gap-1.5" aria-label={`Rated ${rating} out of 5${reviewCount ? ` from ${reviewCount} reviews` : ""}`}>
      <div className="flex items-center gap-0.5" aria-hidden="true">
        {Array.from({ length: 5 }).map((_, i) => (
          <svg key={i} viewBox="0 0 20 20" className={starSize} fill={i < Math.round(rating) ? "#FF3D57" : "none"} stroke="#8B8983" strokeWidth="1">
            <path d="M10 1.5l2.6 5.4 5.9.8-4.3 4.2 1 5.9L10 15l-5.2 2.8 1-5.9-4.3-4.2 5.9-.8L10 1.5z" strokeLinejoin="round" />
          </svg>
        ))}
      </div>
      <span className="text-xs text-paper-dim">
        {rating}
        {reviewCount ? ` (${reviewCount.toLocaleString("en-IN")})` : ""}
      </span>
    </div>
  );
}
