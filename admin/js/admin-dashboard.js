import { db } from "../../firebase.js";
import { checkAdminAuth, adminLogout } from "./admin-auth.js";
import {
  collection,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

document.addEventListener("DOMContentLoaded", () => {
  checkAdminAuth(() => {
    initDashboard();
  });
});

function initDashboard() {
  setupSidebar();

  // Set date header
  const dateEl = document.getElementById("current-date");
  if (dateEl) {
    dateEl.textContent = new Date().toLocaleDateString("en-IN", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric"
    });
  }

  loadStatsAndTables();
}

function setupSidebar() {
  const toggleBtn = document.getElementById("sidebar-toggle");
  const sidebar = document.getElementById("admin-sidebar");
  const overlay = document.getElementById("sidebar-overlay");
  const logoutBtn = document.getElementById("logout-btn");

  if (toggleBtn && sidebar) {
    toggleBtn.addEventListener("click", () => {
      sidebar.classList.toggle("open");
      if (overlay) overlay.classList.toggle("visible");
    });
  }

  if (overlay) {
    overlay.addEventListener("click", () => {
      sidebar.classList.remove("open");
      overlay.classList.remove("visible");
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", (e) => {
      e.preventDefault();
      adminLogout();
    });
  }
}

async function loadStatsAndTables() {
  try {
    // 1. Fetch Products from Firestore
    const productsSnap = await getDocs(collection(db, "products"));
    const products = [];
    productsSnap.forEach(d => products.push({ id: d.id, ...d.data() }));

    // 2. Fetch Orders from Firestore
    const ordersSnap = await getDocs(collection(db, "orders"));
    const orders = [];
    ordersSnap.forEach(d => orders.push({ id: d.id, ...d.data() }));

    // 3. Compute Metrics
    const totalRevenue = orders.reduce((sum, o) => {
      const price = Number(o.totalPrice || o.subtotal || o.totalAmount || 0);
      return sum + price;
    }, 0);

    const pendingOrders = orders.filter(o => {
      const status = (o.orderStatus || o.status || "").toLowerCase();
      return status === "pending";
    }).length;

    // Render Stats Cards
    setStatValue("stat-products", products.length.toLocaleString("en-IN"));
    setStatValue("stat-orders", orders.length.toLocaleString("en-IN"));
    setStatValue("stat-revenue", formatCurrency(totalRevenue));
    setStatValue("stat-pending", pendingOrders.toLocaleString("en-IN"));

    // 4. Render Recent Orders (Top 5)
    renderRecentOrders(orders);

    // 5. Render Featured / Low-Stock Products
    renderFeaturedProducts(products);

  } catch (err) {
    console.error("Dashboard data load error:", err);
  }
}

function setStatValue(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function renderRecentOrders(orders) {
  const tbody = document.getElementById("recent-orders-body");
  if (!tbody) return;

  const sorted = [...orders].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).slice(0, 5);

  if (sorted.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="table-empty">No orders found.</td></tr>`;
    return;
  }

  tbody.innerHTML = sorted.map(order => {
    const id = order.orderId || order.id || "—";
    const customer = (order.address && order.address.fullName) || order.userEmail || "Guest";
    const itemCount = Array.isArray(order.items) ? order.items.reduce((s, i) => s + (i.qty || 1), 0) : 1;
    const total = formatCurrency(order.totalPrice || order.subtotal || 0);
    const status = renderStatusBadge(order.orderStatus || order.status || "Pending");
    const date = formatDate(order.createdAt);

    return `
      <tr>
        <td class="mono">#${escHtml(id)}</td>
        <td>${escHtml(customer)}</td>
        <td>${itemCount}</td>
        <td>${total}</td>
        <td>${status}</td>
        <td>${date}</td>
        <td>
          <a href="orders.html?id=${encodeURIComponent(id)}" class="btn-action btn-action--view" title="View Details">🔍 View</a>
        </td>
      </tr>
    `;
  }).join("");
}

function renderFeaturedProducts(products) {
  const tbody = document.getElementById("featured-body");
  if (!tbody) return;

  // Filter featured or low-stock items
  const featured = products.filter(p => p.featured || isLowStock(p)).slice(0, 8);

  if (featured.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="table-empty">No featured or low-stock products.</td></tr>`;
    return;
  }

  tbody.innerHTML = featured.map(p => {
    const img = p.image || p.image2 || p.image3 || "";
    const imgHtml = img
      ? `<img src="${escHtml(img)}" alt="${escHtml(p.name)}" class="table-thumb" loading="lazy" onerror="this.style.display='none'" />`
      : `<div class="table-thumb-placeholder">—</div>`;

    const inStock = checkProductInStock(p);
    const badge = renderProductBadge(p.badge);
    const isFeatured = p.featured ? `<span class="text-gold">★</span>` : `—`;

    return `
      <tr>
        <td>${imgHtml}</td>
        <td>${escHtml(p.name || "—")}</td>
        <td class="text-capitalize">${escHtml(p.category || "—")}</td>
        <td>${formatCurrency(p.price || 0)}</td>
        <td>${badge}</td>
        <td>${inStock ? `<span class="text-success">In Stock</span>` : `<span class="text-danger">Out of Stock</span>`}</td>
        <td>${isFeatured}</td>
      </tr>
    `;
  }).join("");
}

function isLowStock(p) {
  if (p.hasSizes === false || p.hasSizes === "false") {
    return Number(p.stock || 0) <= 2;
  }
  const xs = Number(p.xsStock || 0);
  const s = Number(p.sStock || 0);
  const m = Number(p.mStock || 0);
  const l = Number(p.lStock || 0);
  const xl = Number(p.xlStock || 0);
  const xxl = Number(p.xxlStock || 0);
  return (xs + s + m + l + xl + xxl) <= 3;
}

function checkProductInStock(p) {
  if (p.hasSizes === false || p.hasSizes === "false") {
    return Number(p.stock || 0) > 0;
  }
  const xs = Number(p.xsStock || 0);
  const s = Number(p.sStock || 0);
  const m = Number(p.mStock || 0);
  const l = Number(p.lStock || 0);
  const xl = Number(p.xlStock || 0);
  const xxl = Number(p.xxlStock || 0);
  return (xs + s + m + l + xl + xxl) > 0;
}

function renderStatusBadge(status) {
  const map = {
    'pending':    'badge--pending',
    'processing': 'badge--processing',
    'shipped':    'badge--shipped',
    'delivered':  'badge--delivered',
    'cancelled':  'badge--cancelled',
  };
  const key = (status || "").toLowerCase();
  const cls = map[key] || 'badge--default';
  const label = status || 'Pending';
  return `<span class="status-badge ${cls}">${escHtml(label)}</span>`;
}

function renderProductBadge(badge) {
  if (!badge) return `<span class="text-muted">—</span>`;
  const map = {
    'SALE': 'prod-badge--sale',
    'NEW': 'prod-badge--new',
    'SURPLUS': 'prod-badge--surplus'
  };
  const cls = map[String(badge).toUpperCase()] || '';
  return `<span class="prod-badge ${cls}">${escHtml(badge)}</span>`;
}

function formatCurrency(amount) {
  const num = Number(amount) || 0;
  return "₹" + num.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function escHtml(str) {
  const div = document.createElement("div");
  div.innerText = str ?? "";
  return div.innerHTML;
}
