export default function DeliveryReturnInfo({ store }) {
  return (
    <div className="mt-6 flex flex-col gap-3 rounded-sm border border-border bg-surface p-4 text-sm">
      <InfoRow
        icon={<TruckIcon />}
        title="Estimated delivery"
        detail="Delivery timelines are set by the merchant and will show at checkout on their site."
      />
      <InfoRow
        icon={<ReturnIcon />}
        title="Returns"
        detail="Return policy is set by the merchant — check their site before you buy."
      />
      <InfoRow icon={<StoreIcon />} title="Sold via" detail={store || "Partner store — confirmed at checkout."} />
    </div>
  );
}

function InfoRow({ icon, title, detail }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 shrink-0 text-paper-dim" aria-hidden="true">
        {icon}
      </span>
      <div>
        <p className="font-medium text-paper">{title}</p>
        <p className="text-paper-dim">{detail}</p>
      </div>
    </div>
  );
}

function TruckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
      <rect x="1" y="5" width="11" height="9" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <path d="M12 8h4l3 3v3h-7V8Z" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="5.5" cy="16" r="1.6" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="15.5" cy="16" r="1.6" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}
function ReturnIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
      <path d="M3 10a7 7 0 1 1 2.3 5.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M3 5v5h5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function StoreIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
      <path d="M2 7l1-4h14l1 4" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M3 7v9h14V7" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 16v-4h4v4" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}
