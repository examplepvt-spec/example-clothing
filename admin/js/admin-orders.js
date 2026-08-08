import { db } from "../../firebase.js";
import { checkAdminAuth, adminLogout } from "./admin-auth.js";
import {
  collection,
  getDocs,
  doc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const OrdersState = {
  all: [],
  filtered: [],
  page: 1,
  perPage: 15,
  sortKey: 'createdAt',
  sortDir: 'desc',
  editingOrder: null
};

document.addEventListener("DOMContentLoaded", () => {
  checkAdminAuth(() => {
    initOrders();
  });
});

function initOrders() {
  setupSidebar();
  loadAllOrders();

  // Search input
  const searchInput = document.getElementById("order-search");
  if (searchInput) {
    searchInput.addEventListener("input", debounce(() => {
      OrdersState.page = 1;
      applyOrderFilters();
    }, 250));
  }

  // Status filter
  const statusFilter = document.getElementById("status-filter");
  if (statusFilter) {
    statusFilter.addEventListener("change", () => {
      OrdersState.page = 1;
      applyOrderFilters();
    });
  }

  // Sortable headers
  const sortableThs = document.querySelectorAll(".admin-table th.sortable");
  sortableThs.forEach(th => {
    th.addEventListener("click", () => {
      const key = th.dataset.sort;
      if (OrdersState.sortKey === key) {
        OrdersState.sortDir = OrdersState.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        OrdersState.sortKey = key;
        OrdersState.sortDir = 'desc';
      }

      sortableThs.forEach(h => {
        const arrow = h.querySelector(".sort-arrow");
        if (arrow) arrow.textContent = "⇅";
      });
      const activeArrow = th.querySelector(".sort-arrow");
      if (activeArrow) activeArrow.textContent = OrdersState.sortDir === 'asc' ? "↑" : "↓";

      applyOrderFilters();
    });
  });

  // Modal Handlers
  document.getElementById("order-modal-close")?.addEventListener("click", () => closeModal("order-modal"));
  document.getElementById("order-modal-cancel")?.addEventListener("click", () => closeModal("order-modal"));
  document.getElementById("order-modal-save")?.addEventListener("click", saveOrderDetails);

  const modalOverlay = document.getElementById("order-modal");
  if (modalOverlay) {
    modalOverlay.addEventListener("click", e => {
      if (e.target === modalOverlay) closeModal("order-modal");
    });
  }

  // Check URL search param e.g. ?id=EX123456
  const params = new URLSearchParams(window.location.search);
  const targetId = params.get("id");
  if (targetId) {
    OrdersState.targetIdOnLoad = targetId;
  }
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

async function loadAllOrders() {
  const tbody = document.getElementById("orders-body");
  if (tbody) tbody.innerHTML = `<tr><td colspan="7" class="table-empty">Loading orders from Firestore...</td></tr>`;

  try {
    const snap = await getDocs(collection(db, "orders"));
    const orders = [];
    snap.forEach(d => orders.push({ id: d.id, ...d.data() }));

    OrdersState.all = orders;
    OrdersState.filtered = [...orders];

    applyOrderFilters();

    // Auto-open modal if target ID was passed in query params
    if (OrdersState.targetIdOnLoad) {
      const match = orders.find(o => String(o.orderId || o.id) === String(OrdersState.targetIdOnLoad));
      if (match) openOrderModal(match);
      OrdersState.targetIdOnLoad = null;
    }

  } catch (err) {
    console.error("Error loading orders:", err);
    if (tbody) tbody.innerHTML = `<tr><td colspan="7" class="table-empty text-danger">Failed to load orders. ${escHtml(err.message)}</td></tr>`;
  }
}

function applyOrderFilters() {
  const searchVal = (document.getElementById("order-search")?.value || "").toLowerCase().trim();
  const statusVal = (document.getElementById("status-filter")?.value || "").toLowerCase();

  let filtered = OrdersState.all.filter(o => {
    const orderIdStr = String(o.orderId || o.id || "").toLowerCase();
    const custName = String(o.address?.fullName || o.userEmail || "").toLowerCase();
    const phone = String(o.address?.phone || "").toLowerCase();
    const tracking = String(o.trackingNumber || "").toLowerCase();

    const matchSearch = !searchVal ||
      orderIdStr.includes(searchVal) ||
      custName.includes(searchVal) ||
      phone.includes(searchVal) ||
      tracking.includes(searchVal);

    const currentStatus = String(o.orderStatus || o.status || "").toLowerCase();
    const matchStatus = !statusVal || currentStatus === statusVal;

    return matchSearch && matchStatus;
  });

  if (OrdersState.sortKey) {
    filtered.sort((a, b) => {
      let va = a[OrdersState.sortKey];
      let vb = b[OrdersState.sortKey];

      if (OrdersState.sortKey === 'createdAt') {
        va = new Date(va || 0).getTime();
        vb = new Date(vb || 0).getTime();
      } else if (typeof va === 'string') {
        va = va.toLowerCase();
        vb = (vb || "").toLowerCase();
      }

      if (va < vb) return OrdersState.sortDir === 'asc' ? -1 : 1;
      if (va > vb) return OrdersState.sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }

  OrdersState.filtered = filtered;
  renderOrdersTable();
}

function renderOrdersTable() {
  const tbody = document.getElementById("orders-body");
  const paginEl = document.getElementById("orders-pagination");
  const countEl = document.getElementById("orders-count");
  if (!tbody) return;

  const total = OrdersState.filtered.length;
  const totalPages = Math.ceil(total / OrdersState.perPage) || 1;
  const start = (OrdersState.page - 1) * OrdersState.perPage;
  const slice = OrdersState.filtered.slice(start, start + OrdersState.perPage);

  if (countEl) countEl.textContent = `${total} order${total !== 1 ? 's' : ''}`;

  if (slice.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="table-empty">No orders found.</td></tr>`;
  } else {
    tbody.innerHTML = slice.map(o => {
      const id = o.orderId || o.id || "—";
      const customer = o.address?.fullName || o.userEmail || "Guest";
      const itemCount = Array.isArray(o.items) ? o.items.reduce((s, i) => s + (i.qty || 1), 0) : 1;
      const total = formatCurrency(o.totalPrice || o.subtotal || 0);
      const statusBadge = renderStatusBadge(o.orderStatus || o.status || "Pending");
      const date = formatDate(o.createdAt);

      return `
        <tr data-order-id="${escHtml(id)}">
          <td class="mono">#${escHtml(id)}</td>
          <td>${escHtml(customer)}</td>
          <td>${itemCount}</td>
          <td>${total}</td>
          <td>${statusBadge}</td>
          <td>${date}</td>
          <td class="actions-cell">
            <button class="btn-action btn-action--view" data-id="${escHtml(id)}">🔍 View & Manage</button>
          </td>
        </tr>
      `;
    }).join("");
  }

  // Bind View buttons
  tbody.querySelectorAll(".btn-action--view").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      const order = OrdersState.all.find(o => String(o.orderId || o.id) === String(id));
      if (order) openOrderModal(order);
    });
  });

  // Pagination
  if (paginEl) {
    paginEl.innerHTML = "";
    if (totalPages > 1) {
      paginEl.appendChild(buildPagination(OrdersState.page, totalPages, (newPage) => {
        OrdersState.page = newPage;
        renderOrdersTable();
      }));
    }
  }
}

function openOrderModal(order) {
  OrdersState.editingOrder = order;
  const orderId = order.orderId || order.id;

  document.getElementById("modal-order-id").textContent = `#${orderId}`;
  document.getElementById("modal-order-date").textContent = formatDate(order.createdAt);

  // Status Selector
  const statusSelect = document.getElementById("o-status");
  if (statusSelect) {
    statusSelect.value = order.orderStatus || order.status || "Pending";
  }

  // Courier & Tracking Inputs
  setValue("o-courier", order.courierName || "");
  setValue("o-tracking-num", order.trackingNumber || "");
  setValue("o-tracking-url", order.trackingUrl || "");

  // Customer & Shipping Info
  const addr = order.address || {};
  document.getElementById("info-cust-name").textContent = addr.fullName || order.userEmail || "Guest User";
  document.getElementById("info-cust-email").textContent = order.userEmail || "N/A";
  document.getElementById("info-cust-phone").textContent = addr.phone || "N/A";

  const fullAddr = [
    addr.addressLine1,
    addr.addressLine2,
    addr.city,
    addr.state,
    addr.zipCode
  ].filter(Boolean).join(", ");
  document.getElementById("info-cust-address").textContent = fullAddr || "No address provided";

  // Line Items
  const itemsList = Array.isArray(order.items) ? order.items : [];
  const itemsContainer = document.getElementById("order-items-list");
  if (itemsContainer) {
    itemsContainer.innerHTML = itemsList.map(item => {
      const price = Number(item.offerPrice || item.price) || 0;
      const qty = Number(item.qty) || 1;
      const total = price * qty;
      const img = item.image ? `<img src="${escHtml(item.image)}" class="table-thumb" style="width:36px; height:36px;" />` : `<div class="table-thumb-placeholder" style="width:36px; height:36px;">—</div>`;

      return `
        <div style="display:flex; align-items:center; justify-content:space-between; padding:8px 0; border-bottom:1px solid var(--border);">
          <div style="display:flex; align-items:center; gap:10px;">
            ${img}
            <div>
              <div style="font-weight:600; font-size:0.85rem;">${escHtml(item.name || "Product")}</div>
              <small class="text-muted">Qty: ${qty}${item.size ? " | Size: " + escHtml(item.size) : ""}</small>
            </div>
          </div>
          <div style="font-weight:600; font-size:0.85rem;">${formatCurrency(total)}</div>
        </div>
      `;
    }).join("");
  }

  // Financial Summary
  document.getElementById("summary-subtotal").textContent = formatCurrency(order.subtotal || order.totalPrice || 0);
  document.getElementById("summary-delivery").textContent = (Number(order.deliveryCharge) > 0) ? formatCurrency(order.deliveryCharge) : "FREE";
  document.getElementById("summary-total").textContent = formatCurrency(order.totalPrice || 0);
  document.getElementById("info-payment-method").textContent = order.paymentMethod || "COD / Testing Mode";
  document.getElementById("info-payment-status").textContent = order.paymentStatus || "Pending Verification";
  document.getElementById("info-utr").textContent = order.utrNumber || "—";

  openModal("order-modal");
}

async function saveOrderDetails() {
  if (!OrdersState.editingOrder) return;

  const saveBtn = document.getElementById("order-modal-save");
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = "Updating...";
  }

  const orderId = OrdersState.editingOrder.orderId || OrdersState.editingOrder.id;
  const newStatus = getValue("o-status");
  const newCourier = getValue("o-courier").trim();
  const newTrackingNum = getValue("o-tracking-num").trim();
  const newTrackingUrl = getValue("o-tracking-url").trim();

  const updates = {
    orderStatus: newStatus,
    courierName: newCourier,
    trackingNumber: newTrackingNum,
    trackingUrl: newTrackingUrl
  };

  try {
    // 1. Update Global Order document
    await updateDoc(doc(db, "orders", orderId), updates);

    // 2. Update Customer Subcollection order document if logged-in user
    const userId = OrdersState.editingOrder.userId;
    if (userId && userId !== "guest") {
      try {
        await updateDoc(doc(db, "customers", userId, "orders", orderId), updates);
      } catch (subErr) {
        console.warn("Could not update customer subcollection order:", subErr);
      }
    }

    closeModal("order-modal");
    await loadAllOrders();

  } catch (err) {
    console.error("Failed to update order:", err);
    alert("Failed to update order details: " + err.message);
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = "Save Changes";
    }
  }
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
  return `<span class="status-badge ${cls}">${escHtml(status || 'Pending')}</span>`;
}

function formatCurrency(amount) {
  const num = Number(amount) || 0;
  return "₹" + num.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function getValue(id) {
  const el = document.getElementById(id);
  return el ? el.value : "";
}

function setValue(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val ?? "";
}

function openModal(id) {
  const m = document.getElementById(id);
  if (m) {
    m.classList.add("visible");
    document.body.style.overflow = "hidden";
  }
}

function closeModal(id) {
  const m = document.getElementById(id);
  if (m) {
    m.classList.remove("visible");
    document.body.style.overflow = "";
  }
}

function buildPagination(currentPage, totalPages, onPageChange) {
  const wrap = document.createElement("div");
  wrap.className = "pagination-inner";

  const prevBtn = document.createElement("button");
  prevBtn.className = "page-btn";
  prevBtn.textContent = "← Prev";
  prevBtn.disabled = currentPage <= 1;
  prevBtn.addEventListener("click", () => onPageChange(currentPage - 1));
  wrap.appendChild(prevBtn);

  for (let i = 1; i <= totalPages; i++) {
    const btn = document.createElement("button");
    btn.className = "page-btn" + (i === currentPage ? " active" : "");
    btn.textContent = i;
    btn.addEventListener("click", () => onPageChange(i));
    wrap.appendChild(btn);
  }

  const nextBtn = document.createElement("button");
  nextBtn.className = "page-btn";
  nextBtn.textContent = "Next →";
  nextBtn.disabled = currentPage >= totalPages;
  nextBtn.addEventListener("click", () => onPageChange(currentPage + 1));
  wrap.appendChild(nextBtn);

  return wrap;
}

function debounce(fn, ms) {
  let timer = null;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), ms);
  };
}

function escHtml(str) {
  const div = document.createElement("div");
  div.innerText = str ?? "";
  return div.innerHTML;
}
