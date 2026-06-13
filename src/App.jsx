import React, { useState, useEffect, useCallback } from "react";
import {
  LayoutDashboard, ShoppingCart, ReceiptText, Truck, Users as UsersIcon, Wallet, UserCog,
  BarChart3, ClipboardList, Settings as SettingsIcon, Smartphone, MapPin, Search, Bell,
  Menu, Check, LogOut, Tag, Lock, Minimize2,
} from "lucide-react";

import { C, DISPLAY, inr, collected } from "./theme";
import { supabase, isConfigured } from "./lib/supabase";
import * as api from "./lib/api";
import { isToday } from "./lib/aggregate";
import { Logo, iconBtn } from "./components/ui";

import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import POS from "./pages/POS";
import Sales from "./pages/Sales";
import OrderStatus from "./pages/OrderStatus";
import Delivery from "./pages/Delivery";
import Customers from "./pages/Customers";
import Expenses from "./pages/Expenses";
import Reports from "./pages/Reports";
import Users from "./pages/Users";
import Settings from "./pages/Settings";
import Catalogue from "./pages/Catalogue";
import AppOrders from "./pages/AppOrders";
import LiveTracking from "./pages/LiveTracking";
import Invoice from "./components/Invoice";
import DeliveryAlert from "./components/DeliveryAlert";
import HQPanel from "./pages/hq/HQPanel";

const NAV = [
  { section: "Operations", items: [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "pos", label: "Point of Sale", icon: ShoppingCart },
    { id: "sales", label: "Sales", icon: ReceiptText },
    { id: "orderstatus", label: "Order Status", icon: ClipboardList },
    { id: "delivery", label: "Delivery List", icon: Truck },
  ]},
  { section: "Directory", items: [
    { id: "customers", label: "Customers", icon: UsersIcon },
    { id: "expenses", label: "Expenses", icon: Wallet },
  ]},
  { section: "Insights", items: [
    { id: "reports", label: "Reports", icon: BarChart3 },
  ]},
  { section: "App Channel", items: [
    { id: "apporders", label: "App Orders", icon: Smartphone },
    { id: "tracking", label: "Live Tracking", icon: MapPin },
  ]},
  { section: "System", items: [
    { id: "catalogue", label: "Catalogue", icon: Tag, adminOnly: true },
    { id: "users", label: "System Users", icon: UserCog, adminOnly: true },
    { id: "settings", label: "Settings", icon: SettingsIcon },
  ]},
];

const ADMIN_VIEWS = new Set(["catalogue", "users"]);

function AccessDenied() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
      <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 18, padding: 32, maxWidth: 440, textAlign: "center" }}>
        <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 56, height: 56, borderRadius: 16, background: C.tealLight, marginBottom: 14 }}>
          <Lock size={26} color={C.tealDark} />
        </div>
        <h2 style={{ fontFamily: DISPLAY, fontSize: 18, fontWeight: 800, color: C.navy, marginBottom: 6 }}>Admin only</h2>
        <p style={{ color: C.textMute, fontSize: 13.5, lineHeight: 1.5 }}>This area is restricted to outlet admins. Ask an admin to sign in, or have them upgrade your role from System Users.</p>
      </div>
    </div>
  );
}

/* Missing-env guard ------------------------------------------------ */
function ConfigNeeded() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: C.navy }}>
      <div style={{ background: "#fff", borderRadius: 18, padding: 32, maxWidth: 560 }}>
        <h1 style={{ fontFamily: DISPLAY, fontSize: 20, fontWeight: 800, color: C.navy, marginBottom: 10 }}>Connect your database</h1>
        <p style={{ color: C.textMute, fontSize: 14, lineHeight: 1.6, marginBottom: 14 }}>
          The app can't find your Supabase keys. Create a <code style={{ background: "#EEF2F5", padding: "1px 6px", borderRadius: 6 }}>.env</code> file
          (copy <code style={{ background: "#EEF2F5", padding: "1px 6px", borderRadius: 6 }}>.env.example</code>) with:
        </p>
        <pre style={{ background: "#0E2A3D", color: "#CFE6EE", padding: 16, borderRadius: 12, fontSize: 12.5, overflowX: "auto" }}>{`VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...`}</pre>
        <p style={{ color: C.textFaint, fontSize: 12.5, marginTop: 14 }}>On Netlify, add the same two variables under Site settings → Environment variables, then redeploy. Full steps are in README.md.</p>
      </div>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [view, setView] = useState("dashboard");
  const [sidebar, setSidebar] = useState(false);
  const [toastMsg, setToastMsg] = useState(null);

  const [profile, setProfile] = useState(null);
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [orderItems, setOrderItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [invoiceOrder, setInvoiceOrder] = useState(null);
  const [focusMode, setFocusMode] = useState(false);

  // HQ is reached only via the URL hash #hq — there is no button or nav
  // link anywhere in the app. Even with the hash, it only opens for a
  // super_admin (and the database RLS independently enforces that).
  const [hash, setHash] = useState(() => (typeof window !== "undefined" ? window.location.hash : ""));
  useEffect(() => {
    const onHash = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // Exit focus when leaving POS or when the user hits Escape.
  useEffect(() => { if (view !== "pos") setFocusMode(false); }, [view]);
  useEffect(() => {
    if (!focusMode) return;
    const onKey = (e) => { if (e.key === "Escape") setFocusMode(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusMode]);

  const toast = useCallback((m) => { setToastMsg(m); setTimeout(() => setToastMsg(null), 3200); }, []);

  /* auth bootstrap */
  useEffect(() => {
    if (!isConfigured) { setAuthReady(true); return; }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setAuthReady(true); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  /* data load */
  const refresh = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      const [prod, cust, ord, exp, profs, items] = await Promise.all([
        api.fetchProducts(), api.fetchCustomers(), api.fetchOrders(),
        api.fetchExpenses(), api.fetchProfiles(), api.fetchOrderItems(),
      ]);
      setProducts(prod); setCustomers(cust); setOrders(ord);
      setExpenses(exp); setProfiles(profs); setOrderItems(items);
      setProfile(profs.find((p) => p.id === session.user.id) || null);
    } catch (e) {
      toast("Load error: " + e.message);
    }
    setLoading(false);
  }, [session, toast]);

  useEffect(() => { if (session) refresh(); }, [session, refresh]);

  if (!isConfigured) return <ConfigNeeded />;
  if (!authReady) return <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: C.textMute }}>Loading…</div>;
  if (!session) return <Login />;

  // ── HQ gate ─────────────────────────────────────────────────────────
  // Open the corporate HQ panel only when the URL hash is #hq AND the
  // signed-in user is a super_admin. Anyone else who types #hq is bounced
  // straight back to the normal app — they never even see it exists.
  const wantsHQ = hash === "#hq" || hash === "#/hq";
  if (wantsHQ) {
    // Still resolving the profile? Hold with a spinner rather than flashing.
    if (!profile) {
      return <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: C.textMute }}>Loading…</div>;
    }
    if (profile.role === "super_admin") {
      return <HQPanel profile={profile} onExit={() => { window.location.hash = ""; }} />;
    }
    // Not authorised — quietly drop the hash and fall through to the app.
    if (typeof window !== "undefined" && window.location.hash) {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }

  const go = (v) => { setView(v); setSidebar(false); };

  /* mutators — each returns true/false and refreshes on success */
  const onPay = async (order, items) => {
    try {
      const o = await api.createOrder({ order, items });
      toast(`Order #${o.order_no} billed · ${inr(o.total)}`);
      await refresh();
      setInvoiceOrder(o);
      return true;
    } catch (e) {
      toast("Could not save order: " + e.message);
      return false;
    }
  };
  const onStatus = async (id, status) => {
    setOrders((p) => p.map((o) => (o.id === id ? { ...o, order_status: status } : o)));
    try {
      if (status === "Delivered") {
        // Once an order is delivered, the prior-damage record has served
        // its purpose. Wipe the photos from Storage and clear both
        // columns in one update. The DB has a safety-net trigger too.
        const o = orders.find((x) => x.id === id);
        if (o?.image_urls?.length) {
          try { await api.deleteOrderPhotos(o.image_urls); } catch {/* best-effort */}
        }
        await api.updateOrderFields(id, {
          order_status: status,
          damage_note: null,
          image_urls: [],
        });
        await refresh();
      } else {
        await api.updateOrderStatus(id, status);
      }
    } catch (e) {
      toast("Update failed: " + e.message);
      refresh();
    }
  };
  const onTogglePaid = async (o) => {
    // Cycle to fully Paid, or back to Unpaid. Keep amount_paid in step so
    // revenue figures (which read collected money) stay accurate.
    const next = o.payment_status === "Paid" ? "Unpaid" : "Paid";
    const amount_paid = next === "Paid" ? Number(o.total) : 0;
    setOrders((p) => p.map((x) => (x.id === o.id ? { ...x, payment_status: next, amount_paid } : x)));
    try { await api.updateOrderFields(o.id, { payment_status: next, amount_paid }); } catch (e) { toast("Update failed: " + e.message); refresh(); }
  };
  const onAddCustomer = async (c) => {
    try { await api.createCustomer(c); toast("Customer added"); await refresh(); return true; }
    catch (e) { toast("Could not add: " + e.message); return false; }
  };
  const onDeleteCustomer = async (c) => {
    if (!confirm(`Delete ${c.first_name} ${c.last_name}?`)) return;
    try { await api.deleteCustomer(c.id); toast("Customer deleted"); await refresh(); }
    catch (e) { toast("Delete failed: " + e.message); }
  };
  const onAddExpense = async (e) => {
    try { await api.createExpense(e); toast("Expense added"); await refresh(); return true; }
    catch (err) { toast("Could not add: " + err.message); return false; }
  };
  const onDeleteExpense = async (e) => {
    if (!confirm(`Delete ${e.title}?`)) return;
    try { await api.deleteExpense(e.id); toast("Expense deleted"); await refresh(); }
    catch (err) { toast("Delete failed: " + err.message); }
  };
  const logout = async () => { await supabase.auth.signOut(); };

  const todaySales = orders.filter((o) => isToday(o.created_at)).reduce((a, o) => a + collected(o), 0);
  const todayCount = orders.filter((o) => isToday(o.created_at)).length;
  const displayName = profile?.name || session.user.email;
  const isSuperAdmin = profile?.role === "super_admin";
  // A super_admin gets full admin access inside the store panel too.
  const isAdmin = profile?.role === "admin" || isSuperAdmin;
  const roleLabel = isSuperAdmin ? "Super Admin" : profile?.role === "admin" ? "Admin" : "Staff";

  const visibleNav = NAV
    .map((grp) => ({ ...grp, items: grp.items.filter((it) => !it.adminOnly || isAdmin) }))
    .filter((grp) => grp.items.length > 0);

  return (
    <div style={{ display: "flex", height: "100vh", background: C.bg, color: C.text, overflow: "hidden" }}>
      {/* Sidebar — white, modern dashboard style */}
      {!focusMode && <aside className="wb-sidebar" data-open={sidebar}
        style={{ width: 248, flexShrink: 0, background: "#fff",
          display: "flex", flexDirection: "column", position: "relative", zIndex: 40,
          borderRight: `1px solid ${C.border}` }}>
        <div className="flex items-center gap-3" style={{ padding: "20px 18px 22px" }}>
          <div className="flex items-center justify-center rounded-xl" style={{ background: C.navy, width: 40, height: 40 }}>
            <Logo size={26} />
          </div>
          <div>
            <p style={{ color: C.navy, fontWeight: 700, fontSize: 15, lineHeight: 1, letterSpacing: "-.01em" }}>Whites &amp; Brights</p>
            <p style={{ color: C.textFaint, fontSize: 10.5, fontWeight: 500, letterSpacing: ".05em", marginTop: 4 }}>Store · {profile?.outlet || "—"}</p>
          </div>
        </div>

        <nav style={{ flex: 1, overflowY: "auto", padding: "4px 16px 16px" }}>
          {visibleNav.map((grp) => (
            <div key={grp.section} style={{ marginBottom: 18 }}>
              <p style={{ color: C.textFaint, fontSize: 10.5, fontWeight: 600, letterSpacing: ".14em", textTransform: "uppercase", padding: "6px 8px 8px" }}>{grp.section}</p>
              {grp.items.map((it) => {
                const active = view === it.id;
                return (
                  <button key={it.id} onClick={() => go(it.id)}
                    className="wb-nav"
                    data-active={active}>
                    <it.icon size={17} strokeWidth={active ? 2.2 : 1.7} color={active ? C.teal : C.textMute} />
                    <span style={{ flex: 1 }}>{it.label}</span>
                    {it.soon && <span style={{ fontSize: 9.5, fontWeight: 600, color: C.tealDark, background: C.tealLight, padding: "2px 7px", borderRadius: 99, letterSpacing: ".04em" }}>SOON</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Sign out — quiet button at the foot of the rail */}
        <div style={{ padding: "12px 16px 18px", borderTop: `1px solid ${C.borderSoft}` }}>
          <button onClick={logout}
            className="wb-press w-full inline-flex items-center justify-center gap-2"
            style={{ background: C.bg, color: C.navy, border: `1px solid ${C.border}`,
              padding: "9px 12px", borderRadius: 10, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
            <LogOut size={13} /> Sign out
          </button>
        </div>
      </aside>}

      {/* Main */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {!focusMode && <header className="flex items-center justify-between" style={{ background: "#fff", borderBottom: `1px solid ${C.border}`, padding: "0 28px", height: 68, flexShrink: 0, gap: 18 }}>
          <button className="wb-burger wb-press" onClick={() => setSidebar((s) => !s)} style={{ ...iconBtn(C.bg, C.navy), display: "none" }}><Menu size={18} /></button>

          {/* Centered search */}
          <div className="flex items-center gap-2" style={{ flex: 1, maxWidth: 460, background: C.bg, border: `1px solid ${C.border}`, padding: "8px 14px", borderRadius: 11 }}>
            <Search size={15} color={C.textFaint} />
            <input placeholder="Search orders, customers, products…"
              style={{ flex: 1, border: "none", outline: "none", fontSize: 13.5, background: "transparent", color: C.text }} />
            <span className="wb-kbd">⌘ K</span>
          </div>

          {/* Profile chip — info only, no chevron / no menu */}
          <div className="flex items-center gap-2" style={{ paddingLeft: 8, paddingRight: 12, height: 40, borderRadius: 12, background: C.bg, border: `1px solid ${C.border}` }}>
            <div className="flex items-center justify-center rounded-full" style={{ width: 28, height: 28, background: C.navy, color: "#fff", fontWeight: 600, fontSize: 12 }}>{(displayName || "W")[0].toUpperCase()}</div>
            <div className="wb-hide-sm" style={{ lineHeight: 1.1 }}>
              <p style={{ fontSize: 12.5, fontWeight: 600, color: C.navy, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{displayName}</p>
              <p style={{ fontSize: 10, color: C.textFaint, marginTop: 2, fontWeight: 500 }}>{roleLabel}</p>
            </div>
          </div>
        </header>}

        <main style={{ flex: 1, overflowY: "auto", padding: focusMode ? "24px 32px" : "32px 36px", background: C.bg }}>
          <div key={view} className="wb-enter">
          {ADMIN_VIEWS.has(view) && !isAdmin ? <AccessDenied /> : (
            <>
          {view === "dashboard" && <Dashboard orders={orders} go={go} displayName={displayName} customers={customers} />}
          {view === "pos" && <POS products={products} customers={customers} orders={orders} onPay={onPay} focusMode={focusMode} setFocusMode={setFocusMode} />}
          {view === "sales" && <Sales orders={orders} loading={loading} onStatus={onStatus} onTogglePaid={onTogglePaid} onOpenInvoice={setInvoiceOrder} />}
          {view === "orderstatus" && <OrderStatus orders={orders} onStatus={onStatus} />}
          {view === "delivery" && <Delivery orders={orders} />}
          {view === "customers" && <Customers customers={customers} orders={orders} loading={loading} onAdd={onAddCustomer} onDelete={onDeleteCustomer} />}
          {view === "expenses" && <Expenses expenses={expenses} loading={loading} onAdd={onAddExpense} onDelete={onDeleteExpense} />}
          {view === "reports" && <Reports orders={orders} expenses={expenses} customers={customers} orderItems={orderItems} />}
          {view === "catalogue" && <Catalogue onRefresh={refresh} toast={toast} />}
          {view === "users" && <Users profiles={profiles} loading={loading} onRefresh={refresh} toast={toast} />}
          {view === "settings" && <Settings profile={profile} session={session} toast={toast} onRefresh={refresh} />}
          {view === "apporders" && <AppOrders toast={toast} />}
          {view === "tracking" && <LiveTracking toast={toast} />}
            </>
          )}
          </div>
        </main>
      </div>

      {sidebar && <div onClick={() => setSidebar(false)} style={{ position: "fixed", inset: 0, background: "rgba(10,34,49,.45)", zIndex: 35 }} />}

      {invoiceOrder && (
        <Invoice
          order={invoiceOrder}
          customers={customers}
          orders={orders}
          onClose={() => setInvoiceOrder(null)}
        />
      )}

      <DeliveryAlert orders={orders} onJump={() => setView("delivery")} />

      {focusMode && (
        <button onClick={() => setFocusMode(false)} className="wb-press wb-toast-in"
          style={{ position: "fixed", top: 18, right: 18, zIndex: 65,
            background: C.navy, color: "#fff", border: "none", borderRadius: 99,
            padding: "8px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer",
            display: "inline-flex", alignItems: "center", gap: 6,
            boxShadow: "0 14px 30px -14px rgba(15,42,59,.45)" }}>
          <Minimize2 size={13} /> Exit focus <span style={{ opacity: .65, marginLeft: 4 }}>· Esc</span>
        </button>
      )}

      {toastMsg && (
        <div className="wb-toast-in flex items-center gap-3" style={{ position: "fixed", bottom: 28, right: 28, background: C.navy, color: "#fff", padding: "14px 20px 14px 16px", borderRadius: 16, boxShadow: "0 28px 60px -18px rgba(15,42,59,.5)", zIndex: 60, maxWidth: 420, border: `1px solid ${C.gold}33` }}>
          <div className="flex items-center justify-center rounded-full" style={{ width: 30, height: 30, background: C.green, flexShrink: 0 }}><Check size={16} /></div>
          <span style={{ fontWeight: 500, fontSize: 13.5, letterSpacing: ".005em" }}>{toastMsg}</span>
        </div>
      )}
    </div>
  );
}
