import { useMemo, useState } from "react";
import {
  ADRES_LABELS,
  BETAALMETHODEN,
  BETAALSTATUSSEN,
  KLANT_TYPES,
  RIT_TYPES,
  STATUSSEN,
  seedCustomers,
  seedLogs,
  seedPayments,
  seedRides,
  seedSettings
} from "./data/mockData";
import { useLocalStorage } from "./utils/storage";
import {
  addDays,
  calculateTotal,
  dateOnly,
  downloadFile,
  euro,
  formatDate,
  formatDateTime,
  formatTime,
  makeId,
  mapUrl,
  normalize,
  overlapWarnings,
  phoneUrl,
  rideNumber,
  smsUrl,
  startOfWeek,
  statusClass,
  toCsv,
  todayISO,
  whatsappUrl
} from "./utils/helpers";

const pages = [
  { id: "dashboard", label: "Dashboard", icon: "🏠" },
  { id: "ritten", label: "Ritten", icon: "🚕" },
  { id: "agenda", label: "Agenda", icon: "📅" },
  { id: "klanten", label: "Klanten", icon: "👥" },
  { id: "betalingen", label: "Betalingen", icon: "💳" },
  { id: "rapporten", label: "Rapporten", icon: "📊" },
  { id: "instellingen", label: "Instellingen", icon: "⚙️" },
  { id: "archief", label: "Prullenbak", icon: "🗑️" },
  { id: "profiel", label: "Profiel", icon: "👤" }
];

const mobilePages = ["dashboard", "ritten", "agenda", "klanten", "meer"];

function App() {
  const [loggedIn, setLoggedIn] = useLocalStorage("taxi.loggedIn", false);
  const [activePage, setActivePage] = useLocalStorage("taxi.activePage", "dashboard");
  const [customers, setCustomers] = useLocalStorage("taxi.customers", seedCustomers);
  const [rides, setRides] = useLocalStorage("taxi.rides", seedRides);
  const [payments, setPayments] = useLocalStorage("taxi.payments", seedPayments);
  const [logs, setLogs] = useLocalStorage("taxi.logs", seedLogs);
  const [settings, setSettings] = useLocalStorage("taxi.settings", seedSettings);
  const [notes, setNotes] = useLocalStorage("taxi.notes", []);
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState("");

  const customerMap = useMemo(() => new Map(customers.map((customer) => [customer.id, customer])), [customers]);
  const activeRides = useMemo(() => rides.filter((ride) => !ride.deleted_at), [rides]);
  const archivedRides = useMemo(() => rides.filter((ride) => ride.deleted_at), [rides]);
  const activeCustomers = useMemo(() => customers.filter((customer) => !customer.deleted_at), [customers]);

  const notify = (message) => {
    setToast(message);
    window.clearTimeout(window.__taxiToastTimer);
    window.__taxiToastTimer = window.setTimeout(() => setToast(""), 2600);
  };

  const addLog = (rideId, action, oldValue = "", newValue = "") => {
    setLogs((current) => [
      ...current,
      {
        id: makeId("log"),
        ride_id: rideId,
        action,
        old_value: oldValue,
        new_value: newValue,
        created_by: "Taxichauffeur",
        created_at: new Date().toISOString()
      }
    ]);
  };

  const saveRide = (rideData) => {
    const total = calculateTotal(rideData);
    const now = new Date().toISOString();
    if (rideData.id) {
      const existing = rides.find((ride) => ride.id === rideData.id);
      setRides((current) =>
        current.map((ride) => (ride.id === rideData.id ? { ...ride, ...rideData, total_price: total, updated_at: now } : ride))
      );
      addLog(rideData.id, "Rit bijgewerkt", existing?.status || "", rideData.status || "");
      notify("Rit bijgewerkt");
    } else {
      const newRide = {
        ...rideData,
        id: makeId("ride"),
        ride_number: rideNumber(),
        total_price: total,
        created_at: now,
        updated_at: now,
        deleted_at: null
      };
      setRides((current) => [...current, newRide]);
      addLog(newRide.id, "Rit aangemaakt", "", newRide.status || "Gepland");
      notify("Nieuwe rit opgeslagen");
    }
    setModal(null);
  };

  const duplicateRide = (ride) => {
    const copy = {
      ...ride,
      id: undefined,
      ride_number: undefined,
      status: "Concept",
      payment_status: "Niet betaald",
      paid_at: null,
      pickup_datetime: ride.pickup_datetime,
      internal_notes: `${ride.internal_notes || ""}\nGedupliceerd van ${ride.ride_number}`.trim()
    };
    setModal({ type: "ride-form", ride: copy });
  };

  const softDeleteRide = (rideId) => {
    if (!confirm("Weet je zeker dat je deze rit wilt verwijderen?\nDeze rit wordt naar de prullenbak verplaatst en kan later hersteld worden.")) return;
    setRides((current) => current.map((ride) => (ride.id === rideId ? { ...ride, deleted_at: new Date().toISOString() } : ride)));
    addLog(rideId, "Rit naar prullenbak verplaatst");
    notify("Rit verplaatst naar prullenbak");
    setModal(null);
  };

  const restoreRide = (rideId) => {
    setRides((current) => current.map((ride) => (ride.id === rideId ? { ...ride, deleted_at: null } : ride)));
    addLog(rideId, "Rit hersteld");
    notify("Rit hersteld");
  };

  const permanentlyDeleteRide = (rideId) => {
    if (!confirm("Rit definitief verwijderen? Dit kan niet ongedaan gemaakt worden.")) return;
    setRides((current) => current.filter((ride) => ride.id !== rideId));
    setPayments((current) => current.filter((payment) => payment.ride_id !== rideId));
    setLogs((current) => current.filter((log) => log.ride_id !== rideId));
    notify("Rit definitief verwijderd");
  };

  const updateRideStatus = (rideId, status) => {
    const oldRide = rides.find((ride) => ride.id === rideId);
    setRides((current) => current.map((ride) => (ride.id === rideId ? { ...ride, status, updated_at: new Date().toISOString() } : ride)));
    addLog(rideId, `Status gewijzigd naar ${status}`, oldRide?.status || "", status);
    notify(`Status: ${status}`);
  };

  const saveCustomer = (customerData) => {
    const now = new Date().toISOString();
    const fullName = customerData.company_name && !customerData.first_name && !customerData.last_name
      ? customerData.company_name
      : `${customerData.first_name || ""} ${customerData.last_name || ""}`.trim() || customerData.full_name || customerData.company_name;
    if (customerData.id) {
      setCustomers((current) => current.map((customer) => (customer.id === customerData.id ? { ...customer, ...customerData, full_name: fullName, updated_at: now } : customer)));
      notify("Klant bijgewerkt");
    } else {
      const newCustomer = {
        ...customerData,
        id: makeId("cust"),
        full_name: fullName,
        addresses: customerData.addresses?.length ? customerData.addresses : [],
        is_active: true,
        created_at: now,
        updated_at: now,
        deleted_at: null
      };
      setCustomers((current) => [...current, newCustomer]);
      notify("Nieuwe klant opgeslagen");
    }
    setModal(null);
  };

  const softDeleteCustomer = (customerId) => {
    if (!confirm("Klant archiveren? Bestaande ritten blijven bewaard.")) return;
    setCustomers((current) => current.map((customer) => (customer.id === customerId ? { ...customer, is_active: false, deleted_at: new Date().toISOString() } : customer)));
    notify("Klant gearchiveerd");
    setModal(null);
  };

  const savePayment = (paymentData) => {
    const now = new Date().toISOString();
    const ride = rides.find((item) => item.id === paymentData.ride_id);
    if (!ride) return;
    const newPayment = {
      ...paymentData,
      id: paymentData.id || makeId("pay"),
      customer_id: ride.customer_id,
      status: paymentData.status || "Betaald",
      paid_at: paymentData.paid_at || now,
      created_at: paymentData.created_at || now,
      updated_at: now
    };
    setPayments((current) => (paymentData.id ? current.map((payment) => (payment.id === paymentData.id ? newPayment : payment)) : [...current, newPayment]));
    setRides((current) =>
      current.map((item) =>
        item.id === paymentData.ride_id
          ? { ...item, payment_status: newPayment.status, payment_method: newPayment.method, paid_at: newPayment.paid_at, updated_at: now }
          : item
      )
    );
    addLog(paymentData.ride_id, "Betaling geregistreerd", ride.payment_status, newPayment.status);
    notify("Betaling geregistreerd");
    setModal(null);
  };

  const saveNote = (text) => {
    setNotes((current) => [{ id: makeId("note"), text, created_at: new Date().toISOString() }, ...current]);
    notify("Notitie opgeslagen");
    setModal(null);
  };

  const exportAll = () => {
    const payload = {
      exported_at: new Date().toISOString(),
      customers,
      rides,
      payments,
      logs,
      settings
    };
    downloadFile("taxi-beheer-backup.json", JSON.stringify(payload, null, 2), "application/json");
    notify("Back-up gedownload");
  };

  if (!loggedIn) {
    return <LoginPage onLogin={() => setLoggedIn(true)} />;
  }

  const pageProps = {
    rides,
    activeRides,
    archivedRides,
    customers,
    activeCustomers,
    customerMap,
    payments,
    logs,
    settings,
    notes,
    setActivePage,
    setModal,
    saveRide,
    saveCustomer,
    savePayment,
    saveNote,
    updateRideStatus,
    duplicateRide,
    softDeleteRide,
    restoreRide,
    permanentlyDeleteRide,
    softDeleteCustomer,
    exportAll,
    setSettings,
    notify
  };

  return (
    <div className={`app-shell ${settings.dark_mode ? "dark-mode" : ""}`}>
      <Sidebar activePage={activePage} setActivePage={setActivePage} settings={settings} />
      <main className="content">
        <Topbar activePage={activePage} settings={settings} onExport={exportAll} onLogout={() => setLoggedIn(false)} />
        {activePage === "dashboard" && <DashboardPage {...pageProps} />}
        {activePage === "ritten" && <RidesPage {...pageProps} />}
        {activePage === "agenda" && <CalendarPage {...pageProps} />}
        {activePage === "klanten" && <CustomersPage {...pageProps} />}
        {activePage === "betalingen" && <PaymentsPage {...pageProps} />}
        {activePage === "rapporten" && <ReportsPage {...pageProps} />}
        {activePage === "instellingen" && <SettingsPage {...pageProps} />}
        {activePage === "archief" && <ArchivePage {...pageProps} />}
        {activePage === "profiel" && <ProfilePage settings={settings} onLogout={() => setLoggedIn(false)} />}
      </main>
      <MobileNav activePage={activePage} setActivePage={setActivePage} />
      <QuickActionButton setModal={setModal} setActivePage={setActivePage} />
      <Modal modal={modal} setModal={setModal} {...pageProps} />
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function LoginPage({ onLogin }) {
  return (
    <div className="login-page">
      <section className="login-card">
        <div className="brand-mark">🚕</div>
        <p className="eyebrow">Taxi Beheer App</p>
        <h1>Welkom terug</h1>
        <p className="muted">Beheer ritten, klanten, agenda en betalingen vanuit één snelle app.</p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onLogin();
          }}
        >
          <label>
            E-mailadres
            <input type="email" defaultValue="chauffeur@taxi.be" required />
          </label>
          <label>
            Wachtwoord
            <input type="password" defaultValue="demo1234" required />
          </label>
          <div className="inline-between">
            <label className="checkline"><input type="checkbox" defaultChecked /> Onthoud mij</label>
            <button type="button" className="link-button">Wachtwoord vergeten?</button>
          </div>
          <button className="primary full" type="submit">Inloggen</button>
          <button className="ghost full" type="button">PIN-login voorbereiden</button>
        </form>
      </section>
    </div>
  );
}

function Sidebar({ activePage, setActivePage, settings }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="taxi-logo">🚕</span>
        <div>
          <strong>{settings.company_name || "Taxi Beheer"}</strong>
          <small>{settings.driver_name || "Taxichauffeur"}</small>
        </div>
      </div>
      <nav>
        {pages.map((page) => (
          <button key={page.id} className={activePage === page.id ? "active" : ""} onClick={() => setActivePage(page.id)}>
            <span>{page.icon}</span>{page.label}
          </button>
        ))}
      </nav>
    </aside>
  );
}

function Topbar({ activePage, settings, onExport, onLogout }) {
  const page = pages.find((item) => item.id === activePage);
  return (
    <header className="topbar">
      <div>
        <p className="eyebrow">{settings.company_name}</p>
        <h1>{page?.label || "Dashboard"}</h1>
      </div>
      <div className="topbar-actions">
        <button className="ghost" onClick={onExport}>Back-up</button>
        <button className="secondary" onClick={onLogout}>Uitloggen</button>
      </div>
    </header>
  );
}

function MobileNav({ activePage, setActivePage }) {
  const [openMore, setOpenMore] = useState(false);
  const moreItems = pages.filter((page) => ["betalingen", "rapporten", "instellingen", "archief", "profiel"].includes(page.id));
  return (
    <>
      {openMore && (
        <div className="mobile-more">
          {moreItems.map((page) => (
            <button key={page.id} onClick={() => { setActivePage(page.id); setOpenMore(false); }}>
              <span>{page.icon}</span>{page.label}
            </button>
          ))}
        </div>
      )}
      <nav className="mobile-nav">
        {mobilePages.map((id) => {
          const page = id === "meer" ? { id, label: "Meer", icon: "⋯" } : pages.find((item) => item.id === id);
          const active = activePage === id || (id === "meer" && moreItems.some((item) => item.id === activePage));
          return (
            <button key={id} className={active ? "active" : ""} onClick={() => id === "meer" ? setOpenMore((value) => !value) : setActivePage(id)}>
              <span>{page.icon}</span>{page.label}
            </button>
          );
        })}
      </nav>
    </>
  );
}

function QuickActionButton({ setModal, setActivePage }) {
  const [open, setOpen] = useState(false);
  const actions = [
    { label: "Nieuwe rit", action: () => setModal({ type: "ride-form" }) },
    { label: "Nieuwe klant", action: () => setModal({ type: "customer-form" }) },
    { label: "Nieuwe betaling", action: () => setModal({ type: "payment-form" }) },
    { label: "Nieuwe notitie", action: () => setModal({ type: "note-form" }) },
    { label: "Agenda openen", action: () => setActivePage("agenda") }
  ];
  return (
    <div className="fab-wrap">
      {open && (
        <div className="fab-menu">
          {actions.map((item) => (
            <button key={item.label} onClick={() => { item.action(); setOpen(false); }}>{item.label}</button>
          ))}
        </div>
      )}
      <button className="fab" onClick={() => setOpen((value) => !value)} aria-label="Snelle acties">+</button>
    </div>
  );
}

function DashboardPage({ activeRides, customerMap, payments, setActivePage, setModal, updateRideStatus }) {
  const today = todayISO();
  const tomorrow = dateOnly(addDays(new Date(), 1));
  const todaysRides = activeRides.filter((ride) => dateOnly(ride.pickup_datetime) === today);
  const tomorrowRides = activeRides.filter((ride) => dateOnly(ride.pickup_datetime) === tomorrow);
  const upcoming = activeRides
    .filter((ride) => new Date(ride.pickup_datetime) >= new Date() && !["Geannuleerd", "No-show", "Afgerond"].includes(ride.status))
    .sort((a, b) => new Date(a.pickup_datetime) - new Date(b.pickup_datetime))[0] || activeRides.sort((a, b) => new Date(a.pickup_datetime) - new Date(b.pickup_datetime))[0];
  const revenueToday = todaysRides.filter((ride) => ride.payment_status === "Betaald" || ride.status === "Afgerond").reduce((sum, ride) => sum + Number(ride.total_price || 0), 0);
  const weekStart = startOfWeek(new Date());
  const weekEnd = addDays(weekStart, 7);
  const revenueWeek = activeRides.filter((ride) => new Date(ride.pickup_datetime) >= weekStart && new Date(ride.pickup_datetime) < weekEnd).reduce((sum, ride) => sum + Number(ride.total_price || 0), 0);
  const openAmount = activeRides.filter((ride) => !["Betaald", "Geannuleerd", "Terugbetaald"].includes(ride.payment_status)).reduce((sum, ride) => sum + Number(ride.total_price || 0), 0);
  const cancelled = activeRides.filter((ride) => ["Geannuleerd", "No-show"].includes(ride.status)).length;
  const openPayments = payments.filter((payment) => payment.status !== "Betaald").length;

  return (
    <div className="page-stack">
      <section className="stat-grid">
        <StatCard label="Ritten vandaag" value={todaysRides.length} sub={`${todaysRides.filter((ride) => ride.status === "Afgerond").length} afgerond`} />
        <StatCard label="Ritten morgen" value={tomorrowRides.length} sub="Gepland" />
        <StatCard label="Open betalingen" value={euro(openAmount)} sub={`${openPayments || activeRides.filter((ride) => ride.payment_status !== "Betaald").length} items`} danger />
        <StatCard label="Omzet vandaag" value={euro(revenueToday)} sub={`Week: ${euro(revenueWeek)}`} success />
        <StatCard label="Geannuleerd" value={cancelled} sub="Inclusief no-show" muted />
      </section>

      <div className="two-columns">
        <section className="panel highlight-panel">
          <div className="section-title">
            <div>
              <p className="eyebrow">Volgende rit</p>
              <h2>{upcoming ? customerMap.get(upcoming.customer_id)?.full_name || "Onbekende klant" : "Geen rit gepland"}</h2>
            </div>
            {upcoming && <span className={statusClass(upcoming.status)}>{upcoming.status}</span>}
          </div>
          {upcoming ? (
            <RideHero ride={upcoming} customer={customerMap.get(upcoming.customer_id)} updateRideStatus={updateRideStatus} setModal={setModal} />
          ) : (
            <EmptyState title="Nog geen rit" text="Maak je eerste rit aan via de gele + knop." />
          )}
        </section>

        <section className="panel">
          <div className="section-title">
            <div>
              <p className="eyebrow">Vandaag</p>
              <h2>{formatDate(new Date())}</h2>
            </div>
            <button className="ghost" onClick={() => setActivePage("agenda")}>Open agenda</button>
          </div>
          <div className="today-summary">
            <strong>{todaysRides.length} ritten gepland</strong>
            <span>{todaysRides.filter((ride) => ride.status === "Afgerond").length} ritten afgerond</span>
            <span>{todaysRides.filter((ride) => ["Bezig", "Chauffeur onderweg", "Klant opgehaald"].includes(ride.status)).length} rit bezig</span>
            <span>{euro(revenueToday)} omzet</span>
            <span>{euro(todaysRides.filter((ride) => ride.payment_status !== "Betaald").reduce((sum, ride) => sum + Number(ride.total_price || 0), 0))} nog niet betaald</span>
          </div>
          <div className="quick-grid">
            <button className="primary" onClick={() => setModal({ type: "ride-form" })}>Nieuwe rit</button>
            <button className="secondary" onClick={() => setModal({ type: "customer-form" })}>Nieuwe klant</button>
            <button className="ghost" onClick={() => setActivePage("betalingen")}>Open betalingen</button>
            <button className="ghost" onClick={() => setActivePage("klanten")}>Klant zoeken</button>
          </div>
        </section>
      </div>

      <section className="panel">
        <div className="section-title">
          <div>
            <p className="eyebrow">Klanten op te halen</p>
            <h2>Dagplanning</h2>
          </div>
        </div>
        <div className="ride-card-grid compact">
          {todaysRides.length ? todaysRides.map((ride) => (
            <RideCard key={ride.id} ride={ride} customer={customerMap.get(ride.customer_id)} setModal={setModal} updateRideStatus={updateRideStatus} />
          )) : <EmptyState title="Geen ritten vandaag" text="Je dagplanning is leeg." />}
        </div>
      </section>
    </div>
  );
}

function RideHero({ ride, customer, updateRideStatus, setModal }) {
  return (
    <div className="ride-hero">
      <div className="route-line">
        <span>Van: {ride.pickup_address}</span>
        <strong>→</strong>
        <span>Naar: {ride.destination_address}</span>
      </div>
      <div className="hero-meta">
        <span>Ophalen om {formatTime(ride.pickup_datetime)}</span>
        <span>{customer?.phone}</span>
        <span>{euro(ride.total_price)}</span>
        <span className={statusClass(ride.payment_status)}>{ride.payment_status}</span>
      </div>
      <div className="action-row">
        <a className="primary" href={mapUrl(ride.pickup_address)} target="_blank" rel="noreferrer">Navigeren</a>
        {customer?.phone && <a className="secondary" href={phoneUrl(customer.phone)}>Bellen</a>}
        <button className="warning" onClick={() => updateRideStatus(ride.id, "Bezig")}>Rit starten</button>
        <button className="ghost" onClick={() => setModal({ type: "ride-detail", ride })}>Bekijken</button>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, success, danger, muted }) {
  return (
    <article className={`stat-card ${success ? "success" : ""} ${danger ? "danger" : ""} ${muted ? "muted-card" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{sub}</small>
    </article>
  );
}

function RidesPage({ activeRides, customerMap, setModal, updateRideStatus, duplicateRide, softDeleteRide }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("Alle");
  const [paymentStatus, setPaymentStatus] = useState("Alle");
  const [quickFilter, setQuickFilter] = useState("Alle geplande ritten");
  const [sortBy, setSortBy] = useState("pickup_datetime");

  const filtered = useMemo(() => {
    const q = normalize(query);
    const today = todayISO();
    const tomorrow = dateOnly(addDays(new Date(), 1));
    const weekStart = startOfWeek(new Date());
    const weekEnd = addDays(weekStart, 7);
    const month = new Date().getMonth();
    const year = new Date().getFullYear();
    return activeRides
      .filter((ride) => {
        const customer = customerMap.get(ride.customer_id);
        const haystack = normalize(`${customer?.full_name || ""} ${customer?.phone || ""} ${ride.pickup_address} ${ride.destination_address} ${ride.ride_number} ${ride.flight_number} ${ride.status} ${ride.payment_status}`);
        const date = new Date(ride.pickup_datetime);
        const quickMatch =
          quickFilter === "Alle geplande ritten" ? !["Afgerond", "Geannuleerd", "No-show"].includes(ride.status) :
          quickFilter === "Vandaag" ? dateOnly(ride.pickup_datetime) === today :
          quickFilter === "Morgen" ? dateOnly(ride.pickup_datetime) === tomorrow :
          quickFilter === "Deze week" ? date >= weekStart && date < weekEnd :
          quickFilter === "Deze maand" ? date.getMonth() === month && date.getFullYear() === year :
          quickFilter === "Afgeronde ritten" ? ride.status === "Afgerond" :
          quickFilter === "Geannuleerde ritten" ? ["Geannuleerd", "No-show"].includes(ride.status) :
          quickFilter === "Onbetaalde ritten" ? ride.payment_status !== "Betaald" :
          quickFilter === "Betaalde ritten" ? ride.payment_status === "Betaald" :
          quickFilter === "Vaste klanten" ? customer?.customer_type === "Vaste klant" :
          quickFilter === "Luchthavenritten" ? ride.ride_type === "Luchthavenrit" :
          quickFilter === "Zakelijke ritten" ? ride.ride_type === "Zakelijke rit" :
          quickFilter === "Privéritten" ? ride.ride_type === "Privérit" : true;
        return haystack.includes(q) && quickMatch && (status === "Alle" || ride.status === status) && (paymentStatus === "Alle" || ride.payment_status === paymentStatus);
      })
      .sort((a, b) => {
        if (sortBy === "customer") return (customerMap.get(a.customer_id)?.full_name || "").localeCompare(customerMap.get(b.customer_id)?.full_name || "");
        if (sortBy === "price") return Number(b.total_price || 0) - Number(a.total_price || 0);
        if (sortBy === "status") return a.status.localeCompare(b.status);
        return new Date(a.pickup_datetime) - new Date(b.pickup_datetime);
      });
  }, [activeRides, customerMap, paymentStatus, query, quickFilter, sortBy, status]);

  const exportRides = () => {
    const rows = filtered.map((ride) => ({
      ritnummer: ride.ride_number,
      datum: formatDate(ride.pickup_datetime),
      tijd: formatTime(ride.pickup_datetime),
      klant: customerMap.get(ride.customer_id)?.full_name || "",
      van: ride.pickup_address,
      naar: ride.destination_address,
      prijs: ride.total_price,
      status: ride.status,
      betaling: ride.payment_status
    }));
    downloadFile("ritten-export.csv", toCsv(rows), "text/csv;charset=utf-8");
  };

  return (
    <div className="page-stack">
      <section className="panel">
        <div className="section-title">
          <div>
            <p className="eyebrow">Ritten overzicht</p>
            <h2>Zoeken, filteren en beheren</h2>
          </div>
          <div className="action-row">
            <button className="ghost" onClick={exportRides}>Export CSV</button>
            <button className="primary" onClick={() => setModal({ type: "ride-form" })}>Nieuwe rit</button>
          </div>
        </div>
        <div className="filter-grid">
          <input placeholder="Zoek op klant, adres, datum, ritnummer of vlucht" value={query} onChange={(event) => setQuery(event.target.value)} />
          <select value={quickFilter} onChange={(event) => setQuickFilter(event.target.value)}>
            {["Vandaag", "Morgen", "Deze week", "Deze maand", "Alle geplande ritten", "Afgeronde ritten", "Geannuleerde ritten", "Onbetaalde ritten", "Betaalde ritten", "Vaste klanten", "Luchthavenritten", "Zakelijke ritten", "Privéritten"].map((item) => <option key={item}>{item}</option>)}
          </select>
          <select value={status} onChange={(event) => setStatus(event.target.value)}><option>Alle</option>{STATUSSEN.map((item) => <option key={item}>{item}</option>)}</select>
          <select value={paymentStatus} onChange={(event) => setPaymentStatus(event.target.value)}><option>Alle</option>{BETAALSTATUSSEN.map((item) => <option key={item}>{item}</option>)}</select>
          <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
            <option value="pickup_datetime">Sorteren op datum</option>
            <option value="customer">Sorteren op klant</option>
            <option value="price">Sorteren op prijs</option>
            <option value="status">Sorteren op status</option>
          </select>
        </div>
      </section>

      <section className="panel desktop-table-panel">
        <table>
          <thead><tr><th>Datum</th><th>Tijd</th><th>Klant</th><th>Van</th><th>Naar</th><th>Prijs</th><th>Status</th><th>Betaling</th><th>Acties</th></tr></thead>
          <tbody>
            {filtered.map((ride) => {
              const customer = customerMap.get(ride.customer_id);
              return (
                <tr key={ride.id}>
                  <td>{formatDate(ride.pickup_datetime)}</td>
                  <td>{formatTime(ride.pickup_datetime)}</td>
                  <td>{customer?.full_name || "-"}</td>
                  <td>{ride.pickup_address}</td>
                  <td>{ride.destination_address}</td>
                  <td>{euro(ride.total_price)}</td>
                  <td><span className={statusClass(ride.status)}>{ride.status}</span></td>
                  <td><span className={statusClass(ride.payment_status)}>{ride.payment_status}</span></td>
                  <td>
                    <div className="table-actions">
                      <button onClick={() => setModal({ type: "ride-detail", ride })}>Open</button>
                      <button onClick={() => setModal({ type: "ride-form", ride })}>Bewerk</button>
                      <button onClick={() => duplicateRide(ride)}>Dupliceer</button>
                      <button className="danger-text" onClick={() => softDeleteRide(ride.id)}>Verwijder</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="ride-card-grid mobile-cards">
        {filtered.map((ride) => <RideCard key={ride.id} ride={ride} customer={customerMap.get(ride.customer_id)} setModal={setModal} updateRideStatus={updateRideStatus} duplicateRide={duplicateRide} softDeleteRide={softDeleteRide} />)}
      </section>
      {!filtered.length && <EmptyState title="Geen ritten gevonden" text="Pas je filters aan of maak een nieuwe rit aan." />}
    </div>
  );
}

function RideCard({ ride, customer, setModal, updateRideStatus, duplicateRide, softDeleteRide }) {
  return (
    <article className="ride-card">
      <div className="ride-card-head">
        <div>
          <h3>{customer?.full_name || "Onbekende klant"}</h3>
          <p>{formatDate(ride.pickup_datetime)} om {formatTime(ride.pickup_datetime)}</p>
        </div>
        <strong>{euro(ride.total_price)}</strong>
      </div>
      <div className="route-short">{ride.pickup_address} <span>→</span> {ride.destination_address}</div>
      <div className="badge-row">
        <span className={statusClass(ride.status)}>{ride.status}</span>
        <span className={statusClass(ride.payment_status)}>{ride.payment_status}</span>
        <span className="badge muted">{ride.ride_type}</span>
      </div>
      <div className="card-actions">
        <button onClick={() => setModal({ type: "ride-detail", ride })}>Bekijken</button>
        {customer?.phone && <a href={phoneUrl(customer.phone)}>Bellen</a>}
        <a href={mapUrl(ride.pickup_address)} target="_blank" rel="noreferrer">Navigeren</a>
        <button onClick={() => updateRideStatus(ride.id, "Bezig")}>Start</button>
        {duplicateRide && <button onClick={() => duplicateRide(ride)}>Kopie</button>}
        {softDeleteRide && <button className="danger-text" onClick={() => softDeleteRide(ride.id)}>Wis</button>}
      </div>
    </article>
  );
}

function CustomersPage({ activeCustomers, activeRides, customerMap, setModal, softDeleteCustomer }) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState("Alle");
  const filtered = activeCustomers.filter((customer) => {
    const text = normalize(`${customer.full_name} ${customer.company_name} ${customer.phone} ${customer.email} ${customer.city} ${customer.vat_number} ${customer.notes}`);
    return text.includes(normalize(query)) && (type === "Alle" || customer.customer_type === type);
  });

  const exportCustomers = () => {
    downloadFile("klanten-export.csv", toCsv(filtered.map((customer) => ({ naam: customer.full_name, telefoon: customer.phone, email: customer.email, type: customer.customer_type, stad: customer.city, actief: customer.is_active ? "ja" : "nee" }))), "text/csv;charset=utf-8");
  };

  return (
    <div className="page-stack">
      <section className="panel">
        <div className="section-title">
          <div>
            <p className="eyebrow">Klanten</p>
            <h2>Klantbeheer en ritgeschiedenis</h2>
          </div>
          <div className="action-row">
            <button className="ghost" onClick={exportCustomers}>Export CSV</button>
            <button className="primary" onClick={() => setModal({ type: "customer-form" })}>Nieuwe klant</button>
          </div>
        </div>
        <div className="filter-grid two">
          <input placeholder="Zoek op naam, telefoon, e-mail, adres, bedrijf of notities" value={query} onChange={(event) => setQuery(event.target.value)} />
          <select value={type} onChange={(event) => setType(event.target.value)}><option>Alle</option>{KLANT_TYPES.map((item) => <option key={item}>{item}</option>)}</select>
        </div>
      </section>
      <section className="customer-grid">
        {filtered.map((customer) => {
          const customerRides = activeRides.filter((ride) => ride.customer_id === customer.id);
          const revenue = customerRides.reduce((sum, ride) => sum + Number(ride.total_price || 0), 0);
          const open = customerRides.filter((ride) => ride.payment_status !== "Betaald").reduce((sum, ride) => sum + Number(ride.total_price || 0), 0);
          return (
            <article className="customer-card" key={customer.id}>
              <div className="section-title small">
                <div>
                  <h3>{customer.full_name}</h3>
                  <p>{customer.company_name || customer.customer_type}</p>
                </div>
                <span className={customer.is_active ? "badge success" : "badge muted"}>{customer.is_active ? "Actief" : "Inactief"}</span>
              </div>
              <p className="muted">{customer.street} {customer.house_number}, {customer.postal_code} {customer.city}</p>
              <div className="customer-stats">
                <span>{customerRides.length} ritten</span>
                <span>{euro(revenue)} omzet</span>
                <span>{euro(open)} open</span>
              </div>
              <div className="card-actions">
                <button onClick={() => setModal({ type: "customer-detail", customer })}>Bekijken</button>
                <button onClick={() => setModal({ type: "ride-form", ride: { customer_id: customer.id, pickup_address: `${customer.street} ${customer.house_number}, ${customer.postal_code} ${customer.city}` } })}>Nieuwe rit</button>
                {customer.phone && <a href={phoneUrl(customer.phone)}>Bellen</a>}
                {customer.phone && <a href={whatsappUrl(customer.phone, "Hallo, met uw taxi chauffeur.")} target="_blank" rel="noreferrer">WhatsApp</a>}
                <button onClick={() => setModal({ type: "customer-form", customer })}>Bewerk</button>
                <button className="danger-text" onClick={() => softDeleteCustomer(customer.id)}>Archiveer</button>
              </div>
            </article>
          );
        })}
      </section>
      {!filtered.length && <EmptyState title="Geen klanten gevonden" text="Maak een nieuwe klant aan of pas je zoekterm aan." />}
    </div>
  );
}

function CalendarPage({ activeRides, customerMap, setModal }) {
  const [view, setView] = useState("Dag");
  const [selected, setSelected] = useState(todayISO());
  const selectedDate = new Date(`${selected}T12:00:00`);

  const ridesForDay = (date) => activeRides.filter((ride) => dateOnly(ride.pickup_datetime) === dateOnly(date)).sort((a, b) => new Date(a.pickup_datetime) - new Date(b.pickup_datetime));
  const selectedRides = ridesForDay(selectedDate);
  const weekStart = startOfWeek(selectedDate);
  const monthDays = buildMonthDays(selectedDate);

  return (
    <div className="page-stack">
      <section className="panel">
        <div className="section-title">
          <div>
            <p className="eyebrow">Agenda / Kalender</p>
            <h2>{view}weergave</h2>
          </div>
          <div className="action-row">
            <input type="date" value={selected} onChange={(event) => setSelected(event.target.value)} />
            <button className="primary" onClick={() => setModal({ type: "ride-form", ride: { pickup_datetime: `${selected}T09:00` } })}>Rit toevoegen</button>
          </div>
        </div>
        <div className="tabs">
          {["Dag", "Week", "Maand", "Lijst"].map((item) => <button key={item} className={view === item ? "active" : ""} onClick={() => setView(item)}>{item}</button>)}
        </div>
      </section>

      {view === "Dag" && (
        <section className="panel">
          <div className="section-title">
            <h2>{formatDate(selectedDate)}</h2>
            <span className="badge primary">{selectedRides.length} ritten</span>
          </div>
          <CalendarList rides={selectedRides} customerMap={customerMap} setModal={setModal} />
        </section>
      )}

      {view === "Week" && (
        <section className="week-grid">
          {Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)).map((day) => (
            <article className="panel day-column" key={day.toISOString()}>
              <button className="day-title" onClick={() => { setSelected(dateOnly(day)); setView("Dag"); }}>{formatDate(day)}</button>
              <CalendarList rides={ridesForDay(day)} customerMap={customerMap} setModal={setModal} compact />
            </article>
          ))}
        </section>
      )}

      {view === "Maand" && (
        <section className="panel month-grid">
          {monthDays.map((day) => {
            const rides = ridesForDay(day);
            return (
              <button key={day.toISOString()} className={`month-day ${dateOnly(day) === selected ? "active" : ""}`} onClick={() => { setSelected(dateOnly(day)); setView("Dag"); }}>
                <strong>{day.getDate()}</strong>
                <span>{rides.length} ritten</span>
                <div className="mini-dots">{rides.slice(0, 4).map((ride) => <i key={ride.id} className={`dot ${statusToDot(ride.status, ride.payment_status)}`} />)}</div>
              </button>
            );
          })}
        </section>
      )}

      {view === "Lijst" && (
        <section className="panel">
          <CalendarList rides={[...activeRides].sort((a, b) => new Date(a.pickup_datetime) - new Date(b.pickup_datetime))} customerMap={customerMap} setModal={setModal} />
        </section>
      )}
    </div>
  );
}

function CalendarList({ rides, customerMap, setModal, compact }) {
  if (!rides.length) return <EmptyState title="Geen ritten" text="Klik op deze dag om een rit toe te voegen." />;
  return (
    <div className={compact ? "calendar-list compact" : "calendar-list"}>
      {rides.map((ride) => {
        const customer = customerMap.get(ride.customer_id);
        return (
          <button className={`calendar-item ${statusToDot(ride.status, ride.payment_status)}`} key={ride.id} onClick={() => setModal({ type: "ride-detail", ride })}>
            <strong>{formatTime(ride.pickup_datetime)} - {customer?.full_name || "Onbekende klant"}</strong>
            <span>{ride.pickup_address} → {ride.destination_address}</span>
            <small>{euro(ride.total_price)} · {ride.status} · {ride.payment_status}</small>
          </button>
        );
      })}
    </div>
  );
}

function buildMonthDays(date) {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const start = startOfWeek(first);
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}

function statusToDot(status, paymentStatus) {
  if (paymentStatus && paymentStatus !== "Betaald" && !["Geannuleerd", "No-show"].includes(status)) return "yellow";
  if (status === "Afgerond") return "green";
  if (["Bezig", "Chauffeur onderweg", "Klant opgehaald"].includes(status)) return "orange";
  if (["Geannuleerd", "No-show"].includes(status)) return "red";
  if (status === "Concept") return "grey";
  if (status === "Gefactureerd") return "purple";
  return "blue";
}

function PaymentsPage({ activeRides, customerMap, payments, setModal }) {
  const [filter, setFilter] = useState("Openstaand");
  const unpaidRides = activeRides.filter((ride) => !["Betaald", "Geannuleerd", "Terugbetaald"].includes(ride.payment_status));
  const paidRides = activeRides.filter((ride) => ride.payment_status === "Betaald");
  const invoiceRides = activeRides.filter((ride) => ["Gefactureerd", "Te factureren"].includes(ride.payment_status));
  const visible = filter === "Betaald" ? paidRides : filter === "Facturatie" ? invoiceRides : unpaidRides;

  return (
    <div className="page-stack">
      <section className="stat-grid">
        <StatCard label="Openstaand" value={euro(unpaidRides.reduce((sum, ride) => sum + Number(ride.total_price || 0), 0))} sub={`${unpaidRides.length} ritten`} danger />
        <StatCard label="Betaald" value={euro(paidRides.reduce((sum, ride) => sum + Number(ride.total_price || 0), 0))} sub={`${payments.length} betalingen`} success />
        <StatCard label="Te factureren" value={euro(invoiceRides.reduce((sum, ride) => sum + Number(ride.total_price || 0), 0))} sub={`${invoiceRides.length} ritten`} />
      </section>
      <section className="panel">
        <div className="section-title">
          <div>
            <p className="eyebrow">Betalingen</p>
            <h2>Open betalingen en betaalhistoriek</h2>
          </div>
          <button className="primary" onClick={() => setModal({ type: "payment-form" })}>Nieuwe betaling</button>
        </div>
        <div className="tabs">
          {["Openstaand", "Betaald", "Facturatie"].map((item) => <button key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>{item}</button>)}
        </div>
        <div className="desktop-table-panel always">
          <table>
            <thead><tr><th>Klant</th><th>Datum</th><th>Bedrag</th><th>Methode</th><th>Status</th><th>Actie</th></tr></thead>
            <tbody>
              {visible.map((ride) => (
                <tr key={ride.id}>
                  <td>{customerMap.get(ride.customer_id)?.full_name || "-"}</td>
                  <td>{formatDate(ride.pickup_datetime)}</td>
                  <td>{euro(ride.total_price)}</td>
                  <td>{ride.payment_method}</td>
                  <td><span className={statusClass(ride.payment_status)}>{ride.payment_status}</span></td>
                  <td><button onClick={() => setModal({ type: "payment-form", ride })}>{ride.payment_status === "Betaald" ? "Corrigeer" : "Markeer betaald"}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!visible.length && <EmptyState title="Geen betalingen" text="Er zijn geen ritten binnen deze betaalfilter." />}
      </section>
    </div>
  );
}

function ReportsPage({ activeRides, activeCustomers, customerMap }) {
  const [from, setFrom] = useState(dateOnly(addDays(new Date(), -30)));
  const [to, setTo] = useState(todayISO());
  const filtered = activeRides.filter((ride) => dateOnly(ride.pickup_datetime) >= from && dateOnly(ride.pickup_datetime) <= to);
  const today = todayISO();
  const weekStart = startOfWeek(new Date());
  const month = new Date().getMonth();
  const year = new Date().getFullYear();
  const revenueToday = activeRides.filter((ride) => dateOnly(ride.pickup_datetime) === today).reduce((sum, ride) => sum + Number(ride.total_price || 0), 0);
  const revenueWeek = activeRides.filter((ride) => new Date(ride.pickup_datetime) >= weekStart).reduce((sum, ride) => sum + Number(ride.total_price || 0), 0);
  const revenueMonth = activeRides.filter((ride) => new Date(ride.pickup_datetime).getMonth() === month && new Date(ride.pickup_datetime).getFullYear() === year).reduce((sum, ride) => sum + Number(ride.total_price || 0), 0);
  const openAmount = activeRides.filter((ride) => ride.payment_status !== "Betaald").reduce((sum, ride) => sum + Number(ride.total_price || 0), 0);
  const average = filtered.length ? filtered.reduce((sum, ride) => sum + Number(ride.total_price || 0), 0) / filtered.length : 0;
  const byCustomer = activeCustomers.map((customer) => {
    const customerRides = filtered.filter((ride) => ride.customer_id === customer.id);
    return { customer, count: customerRides.length, revenue: customerRides.reduce((sum, ride) => sum + Number(ride.total_price || 0), 0) };
  }).filter((item) => item.count).sort((a, b) => b.revenue - a.revenue);
  const destinations = Object.entries(filtered.reduce((acc, ride) => {
    const destination = ride.destination_address.split(",")[0];
    acc[destination] = (acc[destination] || 0) + 1;
    return acc;
  }, {})).sort((a, b) => b[1] - a[1]);
  const dayCounts = Object.entries(filtered.reduce((acc, ride) => {
    const day = dateOnly(ride.pickup_datetime);
    acc[day] = (acc[day] || 0) + 1;
    return acc;
  }, {}));

  const exportReport = () => {
    const rows = filtered.map((ride) => ({ datum: formatDate(ride.pickup_datetime), klant: customerMap.get(ride.customer_id)?.full_name, route: `${ride.pickup_address} - ${ride.destination_address}`, bedrag: ride.total_price, status: ride.status, betaling: ride.payment_status }));
    downloadFile("rapport-ritten.csv", toCsv(rows), "text/csv;charset=utf-8");
  };

  return (
    <div className="page-stack">
      <section className="panel">
        <div className="section-title">
          <div><p className="eyebrow">Rapporten / Statistieken</p><h2>Omzet en prestaties</h2></div>
          <button className="ghost" onClick={exportReport}>Export CSV</button>
        </div>
        <div className="filter-grid three">
          <label>Datum van<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
          <label>Datum tot<input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
          <span className="badge primary">{filtered.length} ritten</span>
        </div>
      </section>
      <section className="stat-grid">
        <StatCard label="Omzet vandaag" value={euro(revenueToday)} sub="Alle statussen" success />
        <StatCard label="Omzet deze week" value={euro(revenueWeek)} sub="Maandag tot vandaag" />
        <StatCard label="Omzet deze maand" value={euro(revenueMonth)} sub="Huidige maand" />
        <StatCard label="Open bedragen" value={euro(openAmount)} sub="Nog op te volgen" danger />
        <StatCard label="Gemiddelde ritprijs" value={euro(average)} sub="Binnen filter" />
      </section>
      <div className="two-columns">
        <section className="panel">
          <h2>Beste klanten op omzet</h2>
          <div className="rank-list">
            {byCustomer.slice(0, 8).map((item) => <div key={item.customer.id}><span>{item.customer.full_name}</span><strong>{euro(item.revenue)}</strong><small>{item.count} ritten</small></div>)}
          </div>
        </section>
        <section className="panel">
          <h2>Populairste bestemmingen</h2>
          <div className="rank-list">
            {destinations.slice(0, 8).map(([destination, count]) => <div key={destination}><span>{destination}</span><strong>{count}</strong><small>ritten</small></div>)}
          </div>
        </section>
      </div>
      <section className="panel">
        <h2>Aantal ritten per dag</h2>
        <div className="bar-list">
          {dayCounts.map(([day, count]) => <div key={day}><span>{formatDate(day)}</span><progress max={Math.max(...dayCounts.map(([, value]) => value), 1)} value={count}></progress><strong>{count}</strong></div>)}
        </div>
      </section>
    </div>
  );
}

function SettingsPage({ settings, setSettings, exportAll }) {
  const [form, setForm] = useState(settings);
  const change = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const save = (event) => {
    event.preventDefault();
    setSettings(form);
    alert("Instellingen opgeslagen");
  };
  return (
    <form className="page-stack" onSubmit={save}>
      <section className="panel">
        <div className="section-title"><div><p className="eyebrow">Instellingen</p><h2>Bedrijf, voertuig, tarieven en app</h2></div><button className="primary" type="submit">Opslaan</button></div>
      </section>
      <div className="settings-grid">
        <SettingsGroup title="Bedrijfsgegevens" fields={[
          ["company_name", "Bedrijfsnaam"], ["driver_name", "Naam chauffeur"], ["phone", "Telefoon"], ["email", "E-mail"], ["address", "Adres"], ["vat_number", "BTW-nummer"], ["website", "Website"]
        ]} form={form} change={change} />
        <SettingsGroup title="Voertuig" fields={[
          ["license_plate", "Nummerplaat"], ["vehicle_brand", "Merk"], ["vehicle_model", "Model"], ["vehicle_passengers", "Aantal passagiers"], ["taxi_license_number", "Taxivergunning"], ["insurance_information", "Verzekering"]
        ]} form={form} change={change} />
        <SettingsGroup title="Prijzen" fields={[
          ["start_rate", "Starttarief"], ["price_per_km", "Prijs per kilometer"], ["price_per_minute", "Prijs per minuut"], ["night_surcharge", "Nachttarief (%)"], ["airport_surcharge", "Luchthaventoeslag"], ["waiting_cost_per_minute", "Wachtkost per minuut"], ["minimum_fare", "Minimumtarief"], ["vat_percentage", "BTW-percentage"]
        ]} form={form} change={change} />
        <section className="panel form-grid">
          <h2>App-instellingen</h2>
          <label>Taal<input value={form.language} onChange={(event) => change("language", event.target.value)} /></label>
          <label>Standaard kalenderweergave<input value={form.default_calendar_view} onChange={(event) => change("default_calendar_view", event.target.value)} /></label>
          <label>Standaard betaalmethode<select value={form.default_payment_method} onChange={(event) => change("default_payment_method", event.target.value)}>{BETAALMETHODEN.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label>Standaard ritstatus<select value={form.default_ride_status} onChange={(event) => change("default_ride_status", event.target.value)}>{STATUSSEN.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label>Tijdzone<input value={form.timezone} onChange={(event) => change("timezone", event.target.value)} /></label>
          <label>Datumnotatie<input value={form.date_format} onChange={(event) => change("date_format", event.target.value)} /></label>
          <label>Valuta<input value={form.currency} onChange={(event) => change("currency", event.target.value)} /></label>
          <label className="checkline"><input type="checkbox" checked={Boolean(form.dark_mode)} onChange={(event) => change("dark_mode", event.target.checked)} /> Donkere modus</label>
          <label className="checkline"><input type="checkbox" checked={Boolean(form.notifications)} onChange={(event) => change("notifications", event.target.checked)} /> Meldingen aan</label>
          <button type="button" className="ghost" onClick={exportAll}>Back-up downloaden</button>
        </section>
      </div>
    </form>
  );
}

function SettingsGroup({ title, fields, form, change }) {
  return (
    <section className="panel form-grid">
      <h2>{title}</h2>
      {fields.map(([key, label]) => <label key={key}>{label}<input value={form[key] || ""} onChange={(event) => change(key, event.target.value)} /></label>)}
    </section>
  );
}

function ArchivePage({ archivedRides, customerMap, restoreRide, permanentlyDeleteRide }) {
  return (
    <div className="page-stack">
      <section className="panel">
        <div className="section-title"><div><p className="eyebrow">Prullenbak / Archief</p><h2>Verwijderde ritten</h2></div></div>
        <p className="muted">Soft delete is actief: verwijderde ritten blijven herstelbaar tot je ze definitief verwijdert.</p>
      </section>
      <section className="ride-card-grid">
        {archivedRides.map((ride) => (
          <article className="ride-card" key={ride.id}>
            <h3>{customerMap.get(ride.customer_id)?.full_name || "Onbekende klant"}</h3>
            <p>{formatDateTime(ride.pickup_datetime)}</p>
            <p>{ride.pickup_address} → {ride.destination_address}</p>
            <div className="card-actions">
              <button onClick={() => restoreRide(ride.id)}>Herstellen</button>
              <button className="danger-text" onClick={() => permanentlyDeleteRide(ride.id)}>Definitief verwijderen</button>
            </div>
          </article>
        ))}
        {!archivedRides.length && <EmptyState title="Prullenbak is leeg" text="Verwijderde ritten verschijnen hier." />}
      </section>
    </div>
  );
}

function ProfilePage({ settings, onLogout }) {
  return (
    <div className="page-stack">
      <section className="panel profile-panel">
        <div className="brand-mark">🚕</div>
        <h2>{settings.driver_name}</h2>
        <p>{settings.company_name}</p>
        <p className="muted">Rol: Taxichauffeur / beheerder</p>
        <div className="quick-grid">
          <a className="secondary" href={phoneUrl(settings.phone)}>Bellen</a>
          <a className="ghost" href={`mailto:${settings.email}`}>E-mail sturen</a>
          <button className="danger" onClick={onLogout}>Uitloggen</button>
        </div>
      </section>
    </div>
  );
}

function EmptyState({ title, text }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      <span>{text}</span>
    </div>
  );
}

function Modal({ modal, setModal, activeRides, customers, activeCustomers, customerMap, logs, saveRide, saveCustomer, savePayment, saveNote, updateRideStatus, softDeleteRide, softDeleteCustomer }) {
  if (!modal) return null;
  const close = () => setModal(null);
  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <div className={`modal ${modal.type === "ride-detail" || modal.type === "customer-detail" ? "wide" : ""}`}>
        <button className="modal-close" onClick={close}>×</button>
        {modal.type === "ride-form" && <RideForm ride={modal.ride} customers={activeCustomers} rides={activeRides} saveRide={saveRide} close={close} />}
        {modal.type === "customer-form" && <CustomerForm customer={modal.customer} saveCustomer={saveCustomer} close={close} />}
        {modal.type === "payment-form" && <PaymentForm ride={modal.ride} rides={activeRides} customerMap={customerMap} savePayment={savePayment} close={close} />}
        {modal.type === "note-form" && <NoteForm saveNote={saveNote} close={close} />}
        {modal.type === "ride-detail" && <RideDetail ride={modal.ride} customer={customerMap.get(modal.ride.customer_id)} logs={logs.filter((log) => log.ride_id === modal.ride.id)} setModal={setModal} updateRideStatus={updateRideStatus} softDeleteRide={softDeleteRide} />}
        {modal.type === "customer-detail" && <CustomerDetail customer={modal.customer} rides={activeRides.filter((ride) => ride.customer_id === modal.customer.id)} setModal={setModal} softDeleteCustomer={softDeleteCustomer} />}
      </div>
    </div>
  );
}

function RideForm({ ride = {}, customers, rides, saveRide, close }) {
  const defaultCustomer = customers[0]?.id || "";
  const initial = {
    customer_id: defaultCustomer,
    pickup_datetime: `${todayISO()}T09:00`,
    expected_arrival_time: `${todayISO()}T09:45`,
    pickup_address: "",
    destination_address: "",
    distance_km: "",
    estimated_duration_minutes: 45,
    passenger_count: 1,
    luggage_count: 0,
    child_seat: false,
    wheelchair: false,
    pet: false,
    flight_number: "",
    train_number: "",
    ride_type: "Privérit",
    status: "Gepland",
    internal_notes: "",
    customer_notes: "",
    price: 0,
    waiting_costs: 0,
    parking_costs: 0,
    toll_costs: 0,
    extra_costs: 0,
    discount: 0,
    payment_status: "Niet betaald",
    payment_method: "Cash",
    paid_at: null,
    ...ride
  };
  const [form, setForm] = useState(initial);
  const customer = customers.find((item) => item.id === form.customer_id);
  const warnings = overlapWarnings(form, rides);
  const total = calculateTotal(form);

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const fillCustomerAddress = () => {
    if (!customer) return;
    const address = customer.addresses?.find((item) => item.is_default) || customer.addresses?.[0];
    const fallback = `${customer.street || ""} ${customer.house_number || ""}, ${customer.postal_code || ""} ${customer.city || ""}`.trim();
    update("pickup_address", address ? `${address.street} ${address.house_number}, ${address.postal_code} ${address.city}` : fallback);
  };
  const similar = rides.filter((item) => item.customer_id === form.customer_id && item.destination_address && form.destination_address && normalize(item.destination_address).includes(normalize(form.destination_address.split(",")[0]))).slice(-1)[0];

  const submit = (event) => {
    event.preventDefault();
    if (!form.customer_id || !form.pickup_address || !form.destination_address || !form.pickup_datetime) {
      alert("Vul minstens klant, datum/tijd, ophaaladres en bestemming in.");
      return;
    }
    saveRide({ ...form, total_price: total });
  };

  return (
    <form className="form-stack" onSubmit={submit}>
      <div className="section-title"><div><p className="eyebrow">Ritformulier</p><h2>{form.id ? "Rit bewerken" : "Nieuwe rit"}</h2></div><span className="badge primary">Totaal {euro(total)}</span></div>
      {warnings.length > 0 && (
        <div className="alert warning-alert">
          <strong>Let op: mogelijke overlap</strong>
          {warnings.map((warning) => <span key={warning.id}>Deze rit ligt dicht bij {formatTime(warning.pickup_datetime)} naar {warning.destination_address}. Er is mogelijk te weinig marge.</span>)}
        </div>
      )}
      {similar && <div className="alert">Laatste vergelijkbare rit: {euro(similar.total_price)} op {formatDate(similar.pickup_datetime)}</div>}
      <div className="form-grid two">
        <label>Klant<select value={form.customer_id} onChange={(event) => update("customer_id", event.target.value)} required>{customers.map((item) => <option key={item.id} value={item.id}>{item.full_name} · {item.phone}</option>)}</select></label>
        <button type="button" className="ghost form-button" onClick={fillCustomerAddress}>Gebruik standaard ophaaladres</button>
        <label>Datum en ophaaltijd<input type="datetime-local" value={form.pickup_datetime?.slice(0, 16)} onChange={(event) => update("pickup_datetime", event.target.value)} required /></label>
        <label>Verwachte aankomst<input type="datetime-local" value={form.expected_arrival_time?.slice(0, 16) || ""} onChange={(event) => update("expected_arrival_time", event.target.value)} /></label>
        <label>Ritcategorie<select value={form.ride_type} onChange={(event) => update("ride_type", event.target.value)}>{RIT_TYPES.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>Status<select value={form.status} onChange={(event) => update("status", event.target.value)}>{STATUSSEN.map((item) => <option key={item}>{item}</option>)}</select></label>
      </div>
      <h3>Ophaalgegevens</h3>
      <div className="form-grid two">
        <label>Ophaaladres<input value={form.pickup_address || ""} onChange={(event) => update("pickup_address", event.target.value)} placeholder="Straat en nummer, postcode gemeente" required /></label>
        <label>Extra ophaalinformatie<input value={form.pickup_extra || ""} onChange={(event) => update("pickup_extra", event.target.value)} placeholder="Bel aan, ingang, verdieping..." /></label>
      </div>
      <h3>Bestemming</h3>
      <div className="form-grid two">
        <label>Bestemmingsadres<input value={form.destination_address || ""} onChange={(event) => update("destination_address", event.target.value)} placeholder="Straat en nummer, postcode gemeente" required /></label>
        <label>Extra bestemmingsinformatie<input value={form.destination_extra || ""} onChange={(event) => update("destination_extra", event.target.value)} /></label>
      </div>
      <h3>Ritdetails</h3>
      <div className="form-grid four">
        <label>Aantal passagiers<input type="number" min="1" value={form.passenger_count} onChange={(event) => update("passenger_count", event.target.value)} /></label>
        <label>Aantal koffers<input type="number" min="0" value={form.luggage_count} onChange={(event) => update("luggage_count", event.target.value)} /></label>
        <label>Afstand km<input type="number" min="0" step="0.1" value={form.distance_km || ""} onChange={(event) => update("distance_km", event.target.value)} /></label>
        <label>Duur minuten<input type="number" min="0" value={form.estimated_duration_minutes || ""} onChange={(event) => update("estimated_duration_minutes", event.target.value)} /></label>
        <label className="checkline"><input type="checkbox" checked={Boolean(form.child_seat)} onChange={(event) => update("child_seat", event.target.checked)} /> Kinderzitje</label>
        <label className="checkline"><input type="checkbox" checked={Boolean(form.wheelchair)} onChange={(event) => update("wheelchair", event.target.checked)} /> Rolstoel</label>
        <label className="checkline"><input type="checkbox" checked={Boolean(form.pet)} onChange={(event) => update("pet", event.target.checked)} /> Huisdier</label>
        <label>Vlucht/train<input value={form.flight_number || form.train_number || ""} onChange={(event) => update("flight_number", event.target.value)} /></label>
      </div>
      <h3>Prijs</h3>
      <div className="form-grid four">
        <label>Vaste prijs<input type="number" step="0.01" value={form.price} onChange={(event) => update("price", event.target.value)} /></label>
        <label>Wachtkosten<input type="number" step="0.01" value={form.waiting_costs || 0} onChange={(event) => update("waiting_costs", event.target.value)} /></label>
        <label>Parking<input type="number" step="0.01" value={form.parking_costs || 0} onChange={(event) => update("parking_costs", event.target.value)} /></label>
        <label>Tol<input type="number" step="0.01" value={form.toll_costs || 0} onChange={(event) => update("toll_costs", event.target.value)} /></label>
        <label>Extra kosten<input type="number" step="0.01" value={form.extra_costs || 0} onChange={(event) => update("extra_costs", event.target.value)} /></label>
        <label>Korting<input type="number" step="0.01" value={form.discount || 0} onChange={(event) => update("discount", event.target.value)} /></label>
        <label>Betaalmethode<select value={form.payment_method} onChange={(event) => update("payment_method", event.target.value)}>{BETAALMETHODEN.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>Betaalstatus<select value={form.payment_status} onChange={(event) => update("payment_status", event.target.value)}>{BETAALSTATUSSEN.map((item) => <option key={item}>{item}</option>)}</select></label>
      </div>
      <div className="form-grid two">
        <label>Interne notities<textarea value={form.internal_notes || ""} onChange={(event) => update("internal_notes", event.target.value)} placeholder="Alleen zichtbaar voor chauffeur" /></label>
        <label>Notities voor chauffeur<textarea value={form.customer_notes || ""} onChange={(event) => update("customer_notes", event.target.value)} /></label>
      </div>
      <div className="modal-actions"><button className="ghost" type="button" onClick={close}>Annuleren</button><button className="primary" type="submit">Opslaan</button></div>
    </form>
  );
}

function CustomerForm({ customer = {}, saveCustomer, close }) {
  const initial = {
    first_name: "",
    last_name: "",
    full_name: "",
    company_name: "",
    customer_type: "Particulier",
    phone: "",
    phone_2: "",
    email: "",
    language: "Nederlands",
    date_of_birth: "",
    street: "",
    house_number: "",
    box: "",
    postal_code: "",
    city: "",
    country: "België",
    billing_name: "",
    vat_number: "",
    billing_email: "",
    billing_address: "",
    preferred_payment_method: "Cash",
    fixed_price_agreements: "",
    preferred_route: "",
    needs_extra_help: false,
    child_seat_needed: false,
    wheelchair_transport: false,
    non_smoking: true,
    quiet_ride: false,
    help_with_luggage: false,
    notes: "",
    is_active: true,
    addresses: [],
    ...customer
  };
  const [form, setForm] = useState(initial);
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const addAddress = () => update("addresses", [...(form.addresses || []), { id: makeId("addr"), label: "Thuis", street: "", house_number: "", postal_code: "", city: "", country: "België", notes: "", is_default: false }]);
  const changeAddress = (id, key, value) => update("addresses", form.addresses.map((address) => address.id === id ? { ...address, [key]: value } : address));

  const submit = (event) => {
    event.preventDefault();
    if (!form.first_name && !form.last_name && !form.company_name) {
      alert("Vul een naam of bedrijfsnaam in.");
      return;
    }
    if (!form.phone) {
      alert("Telefoonnummer is aanbevolen en verplicht in deze MVP.");
      return;
    }
    saveCustomer(form);
  };

  return (
    <form className="form-stack" onSubmit={submit}>
      <div className="section-title"><div><p className="eyebrow">Klantformulier</p><h2>{form.id ? "Klant bewerken" : "Nieuwe klant"}</h2></div></div>
      <h3>Persoonlijke gegevens</h3>
      <div className="form-grid three">
        <label>Voornaam<input value={form.first_name || ""} onChange={(event) => update("first_name", event.target.value)} /></label>
        <label>Achternaam<input value={form.last_name || ""} onChange={(event) => update("last_name", event.target.value)} /></label>
        <label>Bedrijfsnaam<input value={form.company_name || ""} onChange={(event) => update("company_name", event.target.value)} /></label>
        <label>Telefoon<input value={form.phone || ""} onChange={(event) => update("phone", event.target.value)} required /></label>
        <label>Tweede telefoon<input value={form.phone_2 || ""} onChange={(event) => update("phone_2", event.target.value)} /></label>
        <label>E-mail<input type="email" value={form.email || ""} onChange={(event) => update("email", event.target.value)} /></label>
        <label>Taalvoorkeur<input value={form.language || ""} onChange={(event) => update("language", event.target.value)} /></label>
        <label>Geboortedatum<input type="date" value={form.date_of_birth || ""} onChange={(event) => update("date_of_birth", event.target.value)} /></label>
        <label>Klanttype<select value={form.customer_type} onChange={(event) => update("customer_type", event.target.value)}>{KLANT_TYPES.map((item) => <option key={item}>{item}</option>)}</select></label>
      </div>
      <h3>Adresgegevens</h3>
      <div className="form-grid three">
        <label>Straat<input value={form.street || ""} onChange={(event) => update("street", event.target.value)} /></label>
        <label>Huisnummer<input value={form.house_number || ""} onChange={(event) => update("house_number", event.target.value)} /></label>
        <label>Bus<input value={form.box || ""} onChange={(event) => update("box", event.target.value)} /></label>
        <label>Postcode<input value={form.postal_code || ""} onChange={(event) => update("postal_code", event.target.value)} /></label>
        <label>Gemeente<input value={form.city || ""} onChange={(event) => update("city", event.target.value)} /></label>
        <label>Land<input value={form.country || ""} onChange={(event) => update("country", event.target.value)} /></label>
      </div>
      <h3>Facturatie</h3>
      <div className="form-grid three">
        <label>Facturatienaam<input value={form.billing_name || ""} onChange={(event) => update("billing_name", event.target.value)} /></label>
        <label>BTW-nummer<input value={form.vat_number || ""} onChange={(event) => update("vat_number", event.target.value)} /></label>
        <label>Facturatie e-mail<input value={form.billing_email || ""} onChange={(event) => update("billing_email", event.target.value)} /></label>
        <label>Facturatieadres<input value={form.billing_address || ""} onChange={(event) => update("billing_address", event.target.value)} /></label>
        <label>Betaaltermijn<input value={form.payment_term || ""} onChange={(event) => update("payment_term", event.target.value)} placeholder="bv. 14 dagen" /></label>
        <label>Voorkeur betaling<select value={form.preferred_payment_method} onChange={(event) => update("preferred_payment_method", event.target.value)}>{BETAALMETHODEN.map((item) => <option key={item}>{item}</option>)}</select></label>
      </div>
      <h3>Voorkeuren</h3>
      <div className="form-grid three">
        <label>Prijsafspraken<textarea value={form.fixed_price_agreements || ""} onChange={(event) => update("fixed_price_agreements", event.target.value)} /></label>
        <label>Voorkeursroute<textarea value={form.preferred_route || ""} onChange={(event) => update("preferred_route", event.target.value)} /></label>
        <label>Interne notities<textarea value={form.notes || ""} onChange={(event) => update("notes", event.target.value)} placeholder="Altijd 10 minuten vroeger aanwezig zijn..." /></label>
        <label className="checkline"><input type="checkbox" checked={Boolean(form.needs_extra_help)} onChange={(event) => update("needs_extra_help", event.target.checked)} /> Heeft extra hulp nodig</label>
        <label className="checkline"><input type="checkbox" checked={Boolean(form.child_seat_needed)} onChange={(event) => update("child_seat_needed", event.target.checked)} /> Kinderzitje nodig</label>
        <label className="checkline"><input type="checkbox" checked={Boolean(form.wheelchair_transport)} onChange={(event) => update("wheelchair_transport", event.target.checked)} /> Rolstoelvervoer</label>
        <label className="checkline"><input type="checkbox" checked={Boolean(form.non_smoking)} onChange={(event) => update("non_smoking", event.target.checked)} /> Niet roken</label>
        <label className="checkline"><input type="checkbox" checked={Boolean(form.quiet_ride)} onChange={(event) => update("quiet_ride", event.target.checked)} /> Stille rit gewenst</label>
        <label className="checkline"><input type="checkbox" checked={Boolean(form.help_with_luggage)} onChange={(event) => update("help_with_luggage", event.target.checked)} /> Help met bagage</label>
      </div>
      <div className="section-title small"><h3>Favoriete adressen</h3><button type="button" className="ghost" onClick={addAddress}>Adres toevoegen</button></div>
      <div className="address-list">
        {(form.addresses || []).map((address) => (
          <div className="address-row" key={address.id}>
            <select value={address.label} onChange={(event) => changeAddress(address.id, "label", event.target.value)}>{ADRES_LABELS.map((item) => <option key={item}>{item}</option>)}</select>
            <input placeholder="Straat" value={address.street} onChange={(event) => changeAddress(address.id, "street", event.target.value)} />
            <input placeholder="Nr" value={address.house_number} onChange={(event) => changeAddress(address.id, "house_number", event.target.value)} />
            <input placeholder="Postcode" value={address.postal_code} onChange={(event) => changeAddress(address.id, "postal_code", event.target.value)} />
            <input placeholder="Gemeente" value={address.city} onChange={(event) => changeAddress(address.id, "city", event.target.value)} />
          </div>
        ))}
      </div>
      <div className="modal-actions"><button className="ghost" type="button" onClick={close}>Annuleren</button><button className="primary" type="submit">Opslaan</button></div>
    </form>
  );
}

function PaymentForm({ ride, rides, customerMap, savePayment, close }) {
  const initialRide = ride || rides.find((item) => item.payment_status !== "Betaald") || rides[0];
  const [form, setForm] = useState({
    ride_id: initialRide?.id || "",
    amount: initialRide?.total_price || 0,
    method: initialRide?.payment_method || "Cash",
    status: "Betaald",
    paid_at: new Date().toISOString().slice(0, 16),
    reference: "",
    notes: ""
  });
  const selectedRide = rides.find((item) => item.id === form.ride_id);
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const submit = (event) => {
    event.preventDefault();
    if (!form.ride_id) {
      alert("Selecteer een rit.");
      return;
    }
    savePayment({ ...form, paid_at: form.paid_at ? new Date(form.paid_at).toISOString() : new Date().toISOString() });
  };
  return (
    <form className="form-stack" onSubmit={submit}>
      <div className="section-title"><div><p className="eyebrow">Betaling</p><h2>Betaling registreren</h2></div></div>
      <div className="form-grid two">
        <label>Rit<select value={form.ride_id} onChange={(event) => {
          const chosen = rides.find((item) => item.id === event.target.value);
          update("ride_id", event.target.value);
          if (chosen) setForm((current) => ({ ...current, ride_id: chosen.id, amount: chosen.total_price, method: chosen.payment_method }));
        }}>{rides.map((item) => <option key={item.id} value={item.id}>{item.ride_number} · {customerMap.get(item.customer_id)?.full_name} · {euro(item.total_price)}</option>)}</select></label>
        <label>Bedrag<input type="number" step="0.01" value={form.amount} onChange={(event) => update("amount", event.target.value)} /></label>
        <label>Betaalmethode<select value={form.method} onChange={(event) => update("method", event.target.value)}>{BETAALMETHODEN.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>Status<select value={form.status} onChange={(event) => update("status", event.target.value)}>{BETAALSTATUSSEN.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>Betaaldatum<input type="datetime-local" value={form.paid_at} onChange={(event) => update("paid_at", event.target.value)} /></label>
        <label>Referentie<input value={form.reference} onChange={(event) => update("reference", event.target.value)} placeholder="Factuurnummer of transactiereferentie" /></label>
      </div>
      {selectedRide && <div className="alert">Open bedrag voor deze rit: {euro(selectedRide.total_price)} · huidige status: {selectedRide.payment_status}</div>}
      <label>Notities<textarea value={form.notes} onChange={(event) => update("notes", event.target.value)} /></label>
      <div className="modal-actions"><button className="ghost" type="button" onClick={close}>Annuleren</button><button className="primary" type="submit">Opslaan</button></div>
    </form>
  );
}

function NoteForm({ saveNote, close }) {
  const [text, setText] = useState("");
  return (
    <form className="form-stack" onSubmit={(event) => { event.preventDefault(); if (text.trim()) saveNote(text.trim()); }}>
      <div className="section-title"><div><p className="eyebrow">Notitie</p><h2>Nieuwe interne notitie</h2></div></div>
      <textarea rows="8" value={text} onChange={(event) => setText(event.target.value)} placeholder="Schrijf een korte notitie voor later..." />
      <div className="modal-actions"><button className="ghost" type="button" onClick={close}>Annuleren</button><button className="primary" type="submit">Opslaan</button></div>
    </form>
  );
}

function RideDetail({ ride, customer, logs, setModal, updateRideStatus, softDeleteRide }) {
  return (
    <div className="detail-stack">
      <div className="detail-hero">
        <div>
          <p className="eyebrow">Ritdetails</p>
          <h2>{customer?.full_name || "Onbekende klant"}</h2>
          <p>{formatDateTime(ride.pickup_datetime)} · {ride.ride_number}</p>
        </div>
        <div className="badge-column"><span className={statusClass(ride.status)}>{ride.status}</span><span className={statusClass(ride.payment_status)}>{ride.payment_status}</span><strong>{euro(ride.total_price)}</strong></div>
      </div>
      <div className="quick-grid detail-actions">
        {customer?.phone && <a className="secondary" href={phoneUrl(customer.phone)}>Bellen</a>}
        {customer?.phone && <a className="ghost" href={whatsappUrl(customer.phone, `Hallo ${customer.first_name || ""}, ik ben onderweg voor uw taxirit.`)} target="_blank" rel="noreferrer">WhatsApp sturen</a>}
        {customer?.phone && <a className="ghost" href={smsUrl(customer.phone)}>SMS sturen</a>}
        <a className="primary" href={mapUrl(ride.pickup_address)} target="_blank" rel="noreferrer">Navigeren naar ophaaladres</a>
        <a className="ghost" href={mapUrl(ride.destination_address)} target="_blank" rel="noreferrer">Navigeren naar bestemming</a>
        <button className="warning" onClick={() => updateRideStatus(ride.id, "Chauffeur onderweg")}>Chauffeur onderweg</button>
        <button className="warning" onClick={() => updateRideStatus(ride.id, "Klant opgehaald")}>Klant opgehaald</button>
        <button className="warning" onClick={() => updateRideStatus(ride.id, "Bezig")}>Rit starten</button>
        <button className="success-button" onClick={() => updateRideStatus(ride.id, "Afgerond")}>Rit afronden</button>
        <button onClick={() => setModal({ type: "payment-form", ride })}>Betaling registreren</button>
        <button onClick={() => setModal({ type: "ride-form", ride })}>Bewerken</button>
        <button className="danger" onClick={() => softDeleteRide(ride.id)}>Verwijderen</button>
      </div>
      <div className="two-columns">
        <section className="panel inner">
          <h3>Route-informatie</h3>
          <p><strong>Ophalen:</strong> {ride.pickup_address}</p>
          <p><strong>Bestemming:</strong> {ride.destination_address}</p>
          <p><strong>Afstand:</strong> {ride.distance_km || "-"} km</p>
          <p><strong>Geschatte reistijd:</strong> {ride.estimated_duration_minutes || "-"} minuten</p>
          <p><strong>Passagiers:</strong> {ride.passenger_count} · <strong>Koffers:</strong> {ride.luggage_count}</p>
          <p><strong>Kinderzitje:</strong> {ride.child_seat ? "Ja" : "Nee"} · <strong>Rolstoel:</strong> {ride.wheelchair ? "Ja" : "Nee"} · <strong>Huisdier:</strong> {ride.pet ? "Ja" : "Nee"}</p>
          {ride.flight_number && <p><strong>Vlucht/train:</strong> {ride.flight_number || ride.train_number}</p>}
        </section>
        <section className="panel inner">
          <h3>Klantinformatie</h3>
          <p><strong>Naam:</strong> {customer?.full_name}</p>
          <p><strong>Telefoon:</strong> {customer?.phone}</p>
          <p><strong>E-mail:</strong> {customer?.email}</p>
          <p><strong>Type:</strong> {customer?.customer_type}</p>
          <p><strong>Voorkeuren:</strong> {customer?.notes || "Geen notities"}</p>
        </section>
      </div>
      <section className="panel inner">
        <h3>Financieel</h3>
        <div className="finance-grid">
          <span>Basisprijs <strong>{euro(ride.price)}</strong></span>
          <span>Extra kosten <strong>{euro(Number(ride.extra_costs || 0) + Number(ride.waiting_costs || 0) + Number(ride.parking_costs || 0) + Number(ride.toll_costs || 0))}</strong></span>
          <span>Korting <strong>{euro(ride.discount)}</strong></span>
          <span>Totaal <strong>{euro(ride.total_price)}</strong></span>
          <span>Methode <strong>{ride.payment_method}</strong></span>
          <span>Betaald op <strong>{ride.paid_at ? formatDateTime(ride.paid_at) : "Nog niet betaald"}</strong></span>
        </div>
      </section>
      <section className="panel inner">
        <h3>Notities</h3>
        <p><strong>Intern:</strong> {ride.internal_notes || "Geen interne notities"}</p>
        <p><strong>Voor chauffeur:</strong> {ride.customer_notes || "Geen notities"}</p>
      </section>
      <section className="panel inner">
        <h3>Tijdlijn</h3>
        <div className="timeline">
          {logs.length ? logs.map((log) => <div key={log.id}><time>{formatTime(log.created_at)}</time><span>{log.action}</span><small>{log.old_value && log.new_value ? `${log.old_value} → ${log.new_value}` : formatDate(log.created_at)}</small></div>) : <EmptyState title="Nog geen tijdlijn" text="Wijzigingen verschijnen hier automatisch." />}
        </div>
      </section>
    </div>
  );
}

function CustomerDetail({ customer, rides, setModal, softDeleteCustomer }) {
  const revenue = rides.reduce((sum, ride) => sum + Number(ride.total_price || 0), 0);
  const open = rides.filter((ride) => ride.payment_status !== "Betaald").reduce((sum, ride) => sum + Number(ride.total_price || 0), 0);
  const lastRide = [...rides].sort((a, b) => new Date(b.pickup_datetime) - new Date(a.pickup_datetime))[0];
  const average = rides.length ? revenue / rides.length : 0;
  return (
    <div className="detail-stack">
      <div className="detail-hero">
        <div>
          <p className="eyebrow">Klantdetail</p>
          <h2>{customer.full_name}</h2>
          <p>{customer.phone} · {customer.email || "geen e-mail"}</p>
        </div>
        <span className={customer.is_active ? "badge success" : "badge muted"}>{customer.is_active ? "Actief" : "Inactief"}</span>
      </div>
      <div className="quick-grid detail-actions">
        <button className="primary" onClick={() => setModal({ type: "ride-form", ride: { customer_id: customer.id, pickup_address: `${customer.street} ${customer.house_number}, ${customer.postal_code} ${customer.city}` } })}>Nieuwe rit aanmaken</button>
        {customer.phone && <a className="secondary" href={phoneUrl(customer.phone)}>Bellen</a>}
        {customer.phone && <a className="ghost" href={whatsappUrl(customer.phone, "Hallo, met uw taxichauffeur.")} target="_blank" rel="noreferrer">WhatsApp sturen</a>}
        {customer.email && <a className="ghost" href={`mailto:${customer.email}`}>E-mail sturen</a>}
        <button onClick={() => setModal({ type: "customer-form", customer })}>Bewerken</button>
        <button className="danger" onClick={() => softDeleteCustomer(customer.id)}>Verwijderen</button>
      </div>
      <div className="stat-grid small-stats">
        <StatCard label="Aantal ritten" value={rides.length} sub="Totaal" />
        <StatCard label="Totale omzet" value={euro(revenue)} sub="Alle ritten" success />
        <StatCard label="Openstaand" value={euro(open)} sub="Nog te betalen" danger />
        <StatCard label="Laatste rit" value={lastRide ? formatDate(lastRide.pickup_datetime) : "-"} sub={`Gemiddeld ${euro(average)}`} />
      </div>
      <section className="panel inner">
        <h3>Contact en adres</h3>
        <p><strong>Adres:</strong> {customer.street} {customer.house_number}{customer.box ? ` bus ${customer.box}` : ""}, {customer.postal_code} {customer.city}</p>
        <p><strong>Type:</strong> {customer.customer_type}</p>
        <p><strong>Facturatie:</strong> {customer.billing_name || "-"} · {customer.vat_number || "geen BTW"}</p>
        <p><strong>Voorkeur betaling:</strong> {customer.preferred_payment_method}</p>
      </section>
      <section className="panel inner">
        <h3>Voorkeuren en notities</h3>
        <p>{customer.notes || "Geen notities"}</p>
        <div className="badge-row">
          {customer.needs_extra_help && <span className="badge warning">Extra hulp</span>}
          {customer.child_seat_needed && <span className="badge warning">Kinderzitje</span>}
          {customer.wheelchair_transport && <span className="badge warning">Rolstoel</span>}
          {customer.quiet_ride && <span className="badge primary">Stille rit</span>}
          {customer.help_with_luggage && <span className="badge primary">Bagagehulp</span>}
        </div>
      </section>
      <section className="panel inner">
        <h3>Favoriete adressen</h3>
        <div className="address-cards">
          {(customer.addresses || []).map((address) => <div key={address.id}><strong>{address.label}</strong><span>{address.street} {address.house_number}, {address.postal_code} {address.city}</span><small>{address.notes}</small></div>)}
        </div>
      </section>
      <section className="panel inner">
        <h3>Ritgeschiedenis</h3>
        <div className="history-list">
          {rides.map((ride) => <button key={ride.id} onClick={() => setModal({ type: "ride-detail", ride })}>{formatDate(ride.pickup_datetime)} - {ride.pickup_address} naar {ride.destination_address} - {euro(ride.total_price)} - {ride.payment_status}</button>)}
          {!rides.length && <EmptyState title="Nog geen ritten" text="Maak een rit voor deze klant aan." />}
        </div>
      </section>
    </div>
  );
}

export default App;
