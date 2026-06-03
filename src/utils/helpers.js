export const euro = (value = 0) =>
  new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR" }).format(Number(value || 0));

export const formatDate = (dateLike) => {
  if (!dateLike) return "-";
  return new Intl.DateTimeFormat("nl-BE", { dateStyle: "medium" }).format(new Date(dateLike));
};

export const formatTime = (dateLike) => {
  if (!dateLike) return "-";
  return new Intl.DateTimeFormat("nl-BE", { hour: "2-digit", minute: "2-digit" }).format(new Date(dateLike));
};

export const formatDateTime = (dateLike) => {
  if (!dateLike) return "-";
  return `${formatDate(dateLike)} om ${formatTime(dateLike)}`;
};

export const todayISO = () => new Date().toISOString().slice(0, 10);

export const dateOnly = (dateLike) => new Date(dateLike).toISOString().slice(0, 10);

export const sameDay = (dateLike, day = new Date()) => dateOnly(dateLike) === dateOnly(day);

export const addDays = (date, days) => {
  const clone = new Date(date);
  clone.setDate(clone.getDate() + days);
  return clone;
};

export const startOfWeek = (date = new Date()) => {
  const clone = new Date(date);
  const day = clone.getDay() || 7;
  clone.setDate(clone.getDate() - day + 1);
  clone.setHours(0, 0, 0, 0);
  return clone;
};

export const statusClass = (status = "") => {
  const safe = status.toLowerCase();
  if (safe.includes("afgerond") || safe.includes("betaald")) return "badge success";
  if (safe.includes("geannuleerd") || safe.includes("no-show") || safe.includes("niet")) return "badge danger";
  if (safe.includes("bezig") || safe.includes("onderweg") || safe.includes("opgehaald") || safe.includes("gedeeltelijk")) return "badge warning";
  if (safe.includes("concept") || safe.includes("archief")) return "badge muted";
  if (safe.includes("factur")) return "badge purple";
  return "badge primary";
};

export const normalize = (text = "") => String(text).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export const makeId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;

export const rideNumber = () => `RIT-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

export const mapUrl = (address) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address || "")}`;

export const phoneUrl = (phone) => `tel:${String(phone || "").replace(/\s/g, "")}`;

export const smsUrl = (phone) => `sms:${String(phone || "").replace(/\s/g, "")}`;

export const whatsappUrl = (phone, text = "") => {
  const clean = String(phone || "").replace(/[^0-9]/g, "");
  return `https://wa.me/${clean}?text=${encodeURIComponent(text)}`;
};

export const downloadFile = (filename, content, type = "text/plain") => {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

export const toCsv = (rows) => {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const escape = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  return [headers.join(";"), ...rows.map((row) => headers.map((header) => escape(row[header])).join(";"))].join("\n");
};

export const calculateTotal = (ride) => {
  const price = Number(ride.price || 0);
  const waiting = Number(ride.waiting_costs || 0);
  const parking = Number(ride.parking_costs || 0);
  const toll = Number(ride.toll_costs || 0);
  const extra = Number(ride.extra_costs || 0);
  const discount = Number(ride.discount || 0);
  return Math.max(0, price + waiting + parking + toll + extra - discount);
};

export const overlapWarnings = (ride, rides) => {
  if (!ride.pickup_datetime) return [];
  const start = new Date(ride.pickup_datetime).getTime();
  const end = start + Number(ride.estimated_duration_minutes || 45) * 60 * 1000;
  return rides
    .filter((candidate) => candidate.id !== ride.id && !candidate.deleted_at && !["Geannuleerd", "No-show", "Afgerond"].includes(candidate.status))
    .filter((candidate) => {
      const cStart = new Date(candidate.pickup_datetime).getTime();
      const cEnd = cStart + Number(candidate.estimated_duration_minutes || 45) * 60 * 1000;
      const margin = 10 * 60 * 1000;
      return start < cEnd + margin && end + margin > cStart;
    });
};
