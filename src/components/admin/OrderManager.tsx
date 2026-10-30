import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Download, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import OrderDetailDialog from "@/components/admin/OrderDetailDialog";
import { inr } from "@/lib/shop";
import { ADMIN_STATUS_OPTIONS, canTransition, normalizeStatus, paymentLabel, statusLabel } from "@/lib/orderStatus";
import { type AdminOrderRow } from "@/lib/orders";
import { fetchAdminCollection, softDeleteAdminOrder, updateAdminDoc } from "@/lib/adminApi";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";
import { updateAdminOrder } from "@/lib/adminApi";
import { db } from "@/lib/firebase";

const PAGE_SIZE = 15;
const BULK = ["processing", "packed", "shipped", "delivered"] as const;
const inputCls = "bg-background/40 border-gold/20";

const inRange = (iso: string, range: string, from: string, to: string) => {
  const d = new Date(iso);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (range === "today") return d >= startOfToday;
  if (range === "yesterday") {
    const y = new Date(startOfToday); y.setDate(y.getDate() - 1);
    return d >= y && d < startOfToday;
  }
  if (range === "7d") { const s = new Date(startOfToday); s.setDate(s.getDate() - 6); return d >= s; }
  if (range === "30d") { const s = new Date(startOfToday); s.setDate(s.getDate() - 29); return d >= s; }
  if (range === "custom") {
    if (from && d < new Date(from)) return false;
    if (to) { const end = new Date(to); end.setHours(23, 59, 59, 999); if (d > end) return false; }
    return true;
  }
  return true;
};

/** Full admin order management: search, filter, bulk actions, export and tracking. */
const OrderManager = () => {
  const [orders, setOrders] = useState<AdminOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [payFilter, setPayFilter] = useState("all");
  const [range, setRange] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkTarget, setBulkTarget] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState<AdminOrderRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminOrderRow | null>(null);

  useEffect(() => {
    let unsubscribe = () => {};
    try {
      const qCol = query(collection(db, "orders"), orderBy("created_at", "desc"));
      unsubscribe = onSnapshot(
        qCol,
        (snapshot) => {
          const rows: AdminOrderRow[] = snapshot.docs
            .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
            .filter((row) => !(row as any).deleted_at) as AdminOrderRow[];
          setOrders(rows);
          setLoading(false);
          setError(null);
        },
        async (err) => {
          console.warn("Orders listener fallback to admin API:", err.message);
          try {
            const rows = await fetchAdminCollection("orders");
            setOrders((rows as AdminOrderRow[]).filter((row) => !(row as any).deleted_at));
            setError(null);
          } catch (e) {
            setError("Unable to load orders. Please try again.");
          } finally {
            setLoading(false);
          }
        }
      );
    } catch (e) {
      fetchAdminCollection("orders").then((rows) => {
        setOrders((rows as AdminOrderRow[]).filter((row) => !(row as any).deleted_at));
        setLoading(false);
      });
    }

    return () => unsubscribe();
  }, []);

  useEffect(() => { setPage(1); }, [q, statusFilter, payFilter, range, from, to, sort]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    const list = orders.filter((o) => {
      if (t && ![o.order_number, o.customer_name, o.customer_email, o.customer_phone, o.tracking_number]
        .some((v) => String(v ?? "").toLowerCase().includes(t))) return false;
      if (statusFilter !== "all" && normalizeStatus(o.status) !== statusFilter) return false;
      if (payFilter !== "all" && (o.payment_status ?? "pending").toLowerCase() !== payFilter) return false;
      if (!inRange(o.created_at, range, from, to)) return false;
      return true;
    });
    return sort === "newest" ? list : [...list].reverse();
  }, [orders, q, statusFilter, payFilter, range, from, to, sort]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const shown = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const allShownSelected = shown.length > 0 && shown.every((o) => selected.includes(o.id));

  const exportCSV = () => {
    const headers = ["Order Number", "Customer", "Email", "Phone", "Date", "Amount", "Payment Status", "Order Status", "Tracking Number"];
    const rows = filtered.map((o) => [
      o.order_number ?? o.id, o.customer_name, o.customer_email ?? "", o.customer_phone,
      new Date(o.created_at).toLocaleString("en-IN"), String(o.total), paymentLabel(o.payment_status),
      statusLabel(o.status), o.tracking_number ?? "",
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `orders_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleSelectAll = (checked: boolean) => {
    if (checked) setSelected(Array.from(new Set([...selected, ...shown.map((o) => o.id)])));
    else setSelected(selected.filter((id) => !shown.some((o) => o.id === id)));
  };

  const toggleOne = (id: string, checked: boolean) => {
    setSelected(checked ? [...selected, id] : selected.filter((x) => x !== id));
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await softDeleteAdminOrder(deleteTarget.id);
      setOrders((current) => current.filter((order) => order.id !== deleteTarget.id));
      setSelected((current) => current.filter((id) => id !== deleteTarget.id));
      if (active?.id === deleteTarget.id) setActive(null);
      toast.success(`Order ${deleteTarget.order_number ?? deleteTarget.id} deleted from the admin list`);
      setDeleteTarget(null);
    } catch (err: any) {
      toast.error(err.message || "Failed to delete order");
    } finally {
      setBusy(false);
    }
  };

  const applyBulk = async () => {
    if (!bulkTarget) return;
    setBusy(true);
    let successCount = 0;
    const refused: string[] = [];
    try {
      for (const id of selected) {
        const o = orders.find((x) => x.id === id);
        if (!o || !canTransition(normalizeStatus(o.status), bulkTarget)) continue;
        try {
          await updateAdminOrder(id, { status: bulkTarget });
          successCount++;
        } catch (err: any) {
          refused.push(`${o.order_number ?? id}: ${err.message}`);
        }
      }
      if (refused.length) toast.error(`${refused.length} order(s) not updated. ${refused[0]}`);
      if (successCount) toast.success(`Updated ${successCount} order(s) to ${statusLabel(bulkTarget)}`);
      setSelected([]);
    } catch (err: any) {
      toast.error(err.message || "Failed to update selected orders");
    } finally {
      setBusy(false);
      setBulkTarget(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Search orders, customers, phone, tracking..."
            className={`w-72 ${inputCls}`}
          />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={`h-9 px-2 rounded-md text-xs ${inputCls}`}>
            <option value="all">All Statuses</option>
            {ADMIN_STATUS_OPTIONS.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
          </select>
          <select value={payFilter} onChange={(e) => setPayFilter(e.target.value)} className={`h-9 px-2 rounded-md text-xs ${inputCls}`}>
            <option value="all">All Payments</option>
            <option value="paid">Paid</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
          </select>
          <select value={range} onChange={(e) => setRange(e.target.value)} className={`h-9 px-2 rounded-md text-xs ${inputCls}`}>
            <option value="all">All Dates</option>
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="custom">Custom</option>
          </select>
          {range === "custom" && (
            <div className="flex items-center gap-1">
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`w-36 h-9 text-xs ${inputCls}`} />
              <span className="text-xs text-muted-foreground">to</span>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={`w-36 h-9 text-xs ${inputCls}`} />
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportCSV} className="border-gold/30 text-gold">
            <Download className="h-4 w-4 mr-1" /> Export CSV
          </Button>
        </div>
      </div>

      {selected.length > 0 && (
        <div className="glass-gold rounded-xl p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span>{selected.length} order(s) selected</span>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Change status to:</span>
            {BULK.map((b) => (
              <Button key={b} size="sm" variant="outline" onClick={() => setBulkTarget(b)} className="h-7 text-xs border-gold/30">
                {statusLabel(b)}
              </Button>
            ))}
            <Button size="sm" variant="ghost" onClick={() => setSelected([])} className="h-7 text-xs">Clear</Button>
          </div>
        </div>
      )}

      {error && <div className="text-destructive text-sm p-3 glass-gold rounded-xl">{error}</div>}

      <div className="overflow-x-auto glass-gold rounded-2xl">
        <table className="w-full text-xs text-left">
          <thead className="border-b border-gold/20 text-gold uppercase tracking-wider">
            <tr>
              <th className="p-3 w-8">
                <Checkbox checked={allShownSelected} onCheckedChange={(c) => toggleSelectAll(!!c)} aria-label="Select all on page" />
              </th>
              <th className="p-3">Order</th>
              <th className="p-3">Customer</th>
              <th className="p-3">Contact</th>
              <th className="p-3">Date</th>
              <th className="p-3">Amount</th>
              <th className="p-3">Payment</th>
              <th className="p-3">Status</th>
              <th className="p-3">Tracking</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gold/10">
            {loading ? (
              <tr><td colSpan={10} className="p-6 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></td></tr>
            ) : shown.length === 0 ? (
              <tr><td colSpan={10} className="p-6 text-center text-muted-foreground">No orders match the filters.</td></tr>
            ) : (
              shown.map((o) => (
                <tr key={o.id} className="hover:bg-gold/5 cursor-pointer" onClick={() => setActive(o)}>
                  <td className="p-3" onClick={(e) => e.stopPropagation()}>
                    <Checkbox checked={selected.includes(o.id)} onCheckedChange={(c) => toggleOne(o.id, !!c)} aria-label={`Select order ${o.order_number ?? o.id}`} />
                  </td>
                  <td className="p-3 font-semibold">{o.order_number ?? o.id.slice(0, 8)}</td>
                  <td className="p-3">{o.customer_name}</td>
                  <td className="p-3 text-muted-foreground">{o.customer_phone}</td>
                  <td className="p-3 text-muted-foreground">{new Date(o.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</td>
                  <td className="p-3 font-semibold">{inr(Number(o.total || 0))}</td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] ${o.payment_status === "paid" ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : "bg-amber-500/20 text-amber-300 border border-amber-500/30"}`}>
                      {paymentLabel(o.payment_status)}
                    </span>
                  </td>
                  <td className="p-3">
                    <span className="px-2 py-0.5 rounded-full text-[10px] border border-gold/40 text-gold">
                      {statusLabel(o.status)}
                    </span>
                  </td>
                  <td className="p-3 text-muted-foreground">{o.tracking_number ?? "—"}</td>
                  <td className="p-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setActive(o)} className="h-7 text-xs text-gold">Manage</Button>
                      <Button size="sm" variant="ghost" onClick={() => setDeleteTarget(o)} className="h-7 px-2 text-xs text-destructive" aria-label={`Delete order ${o.order_number ?? o.id}`}>
                        <Trash2 className="h-4 w-4" />
                        <span className="ml-1">Delete</span>
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="flex justify-between items-center text-xs text-muted-foreground pt-2">
          <span>Page {page} of {pages} ({filtered.length} orders)</span>
          <div className="flex gap-1">
            <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage((p) => p - 1)} className="h-7 text-xs border-gold/30">Previous</Button>
            <Button size="sm" variant="outline" disabled={page === pages} onClick={() => setPage((p) => p + 1)} className="h-7 text-xs border-gold/30">Next</Button>
          </div>
        </div>
      )}

      {active && (
        <OrderDetailDialog
          order={active}
          onClose={() => setActive(null)}
          onChanged={() => {}}
        />
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && !busy && setDeleteTarget(null)}>
        <AlertDialogContent className="glass-gold">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete order {deleteTarget?.order_number ?? deleteTarget?.id ?? ""}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will hide the order from the admin list only. The original payment, refund, tracking, and receipt records will remain unchanged.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} disabled={busy} className="bg-destructive text-destructive-foreground">
              {busy ? "Deleting..." : "Delete Order"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!bulkTarget} onOpenChange={(o) => !o && setBulkTarget(null)}>
        <AlertDialogContent className="glass-gold">
          <AlertDialogHeader>
            <AlertDialogTitle>Change status for {selected.length} orders?</AlertDialogTitle>
            <AlertDialogDescription>
              This will update the status of all eligible selected orders to <strong>{bulkTarget ? statusLabel(bulkTarget) : ""}</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={applyBulk} disabled={busy} className="bg-gradient-gold text-primary-foreground">
              {busy ? "Updating..." : "Confirm Update"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default OrderManager;
