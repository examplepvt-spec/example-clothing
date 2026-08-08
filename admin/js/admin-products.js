import { db } from "../../firebase.js";
import { checkAdminAuth, adminLogout } from "./admin-auth.js";
import {
  collection,
  getDocs,
  doc,
  setDoc,
  updateDoc,
  deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const ProductsState = {
  all: [],
  filtered: [],
  page: 1,
  perPage: 15,
  sortKey: null,
  sortDir: 'asc',
  editingId: null
};

document.addEventListener("DOMContentLoaded", () => {
  checkAdminAuth(() => {
    initProducts();
  });
});

function initProducts() {
  setupSidebar();
  loadAllProducts();

  // Search input
  const searchInput = document.getElementById("product-search");
  if (searchInput) {
    searchInput.addEventListener("input", debounce(() => {
      ProductsState.page = 1;
      applyProductFilters();
    }, 250));
  }

  // Category filter
  const catFilter = document.getElementById("category-filter");
  if (catFilter) {
    catFilter.addEventListener("change", () => {
      ProductsState.page = 1;
      applyProductFilters();
    });
  }

  // Sortable headers
  const sortableThs = document.querySelectorAll(".admin-table th.sortable");
  sortableThs.forEach(th => {
    th.addEventListener("click", () => {
      const key = th.dataset.sort;
      if (ProductsState.sortKey === key) {
        ProductsState.sortDir = ProductsState.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        ProductsState.sortKey = key;
        ProductsState.sortDir = 'asc';
      }

      sortableThs.forEach(h => {
        const arrow = h.querySelector(".sort-arrow");
        if (arrow) arrow.textContent = "⇅";
      });
      const activeArrow = th.querySelector(".sort-arrow");
      if (activeArrow) activeArrow.textContent = ProductsState.sortDir === 'asc' ? "↑" : "↓";

      applyProductFilters();
    });
  });

  // Add Product Button
  const addBtn = document.getElementById("add-product-btn");
  if (addBtn) {
    addBtn.addEventListener("click", () => openProductModal(null));
  }

  // Modal Close & Save Handlers
  document.getElementById("modal-close")?.addEventListener("click", () => closeModal("product-modal"));
  document.getElementById("modal-cancel")?.addEventListener("click", () => closeModal("product-modal"));
  document.getElementById("modal-save")?.addEventListener("click", saveProduct);

  const modalOverlay = document.getElementById("product-modal");
  if (modalOverlay) {
    modalOverlay.addEventListener("click", e => {
      if (e.target === modalOverlay) closeModal("product-modal");
    });
  }

  // Toggle size stock inputs based on hasSizes checkbox
  const hasSizesCheck = document.getElementById("p-has-sizes");
  if (hasSizesCheck) {
    hasSizesCheck.addEventListener("change", updateSizeFieldsVisibility);
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

async function loadAllProducts() {
  const tbody = document.getElementById("products-body");
  if (tbody) tbody.innerHTML = `<tr><td colspan="9" class="table-empty">Loading products from Firestore...</td></tr>`;

  try {
    const snap = await getDocs(collection(db, "products"));
    const products = [];
    snap.forEach(d => products.push({ id: d.id, ...d.data() }));

    ProductsState.all = products;
    ProductsState.filtered = [...products];
    renderProductsTable();
  } catch (err) {
    console.error("Error loading products:", err);
    if (tbody) tbody.innerHTML = `<tr><td colspan="9" class="table-empty text-danger">Failed to load products. ${escHtml(err.message)}</td></tr>`;
  }
}

function applyProductFilters() {
  const searchVal = (document.getElementById("product-search")?.value || "").toLowerCase().trim();
  const catVal = (document.getElementById("category-filter")?.value || "").toLowerCase();

  let filtered = ProductsState.all.filter(p => {
    const matchSearch = !searchVal ||
      (p.name || "").toLowerCase().includes(searchVal) ||
      (p.category || "").toLowerCase().includes(searchVal) ||
      (p.subcategory || "").toLowerCase().includes(searchVal) ||
      (p.barcode || "").toLowerCase().includes(searchVal) ||
      String(p.id || "").toLowerCase().includes(searchVal);

    const matchCat = !catVal || (p.category || "").toLowerCase() === catVal;
    return matchSearch && matchCat;
  });

  if (ProductsState.sortKey) {
    filtered.sort((a, b) => {
      let va = a[ProductsState.sortKey];
      let vb = b[ProductsState.sortKey];
      if (typeof va === 'string') va = va.toLowerCase();
      if (typeof vb === 'string') vb = vb.toLowerCase();
      if (va < vb) return ProductsState.sortDir === 'asc' ? -1 : 1;
      if (va > vb) return ProductsState.sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }

  ProductsState.filtered = filtered;
  ProductsState.page = 1;
  renderProductsTable();
}

function renderProductsTable() {
  const tbody = document.getElementById("products-body");
  const paginEl = document.getElementById("products-pagination");
  const countEl = document.getElementById("products-count");
  if (!tbody) return;

  const total = ProductsState.filtered.length;
  const totalPages = Math.ceil(total / ProductsState.perPage) || 1;
  const start = (ProductsState.page - 1) * ProductsState.perPage;
  const slice = ProductsState.filtered.slice(start, start + ProductsState.perPage);

  if (countEl) countEl.textContent = `${total} product${total !== 1 ? 's' : ''}`;

  if (slice.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="table-empty">No products found.</td></tr>`;
  } else {
    tbody.innerHTML = slice.map(p => {
      const img = p.image || p.image2 || p.image3 || "";
      const imgTag = img
        ? `<img src="${escHtml(img)}" alt="${escHtml(p.name)}" class="table-thumb" loading="lazy" onerror="this.style.display='none'" />`
        : `<div class="table-thumb-placeholder">—</div>`;

      const inStock = checkProductInStock(p);
      const stockSummary = formatStockSummary(p);
      const priceText = p.offerPrice && Number(p.offerPrice) < Number(p.price)
        ? `₹${p.offerPrice} <s class="text-muted">₹${p.price}</s>`
        : `₹${p.price || 0}`;

      return `
        <tr data-product-id="${escHtml(p.id)}">
          <td>${imgTag}</td>
          <td class="mono">${escHtml(p.id)}</td>
          <td class="product-name-cell">${escHtml(p.name || '—')}</td>
          <td class="text-capitalize">${escHtml(p.category || '—')}</td>
          <td>${priceText}</td>
          <td>${renderProductBadge(p.badge)}</td>
          <td>${stockSummary}</td>
          <td>${inStock ? '<span class="text-success">In Stock</span>' : '<span class="text-danger">Out</span>'}</td>
          <td class="actions-cell">
            <button class="btn-icon btn-icon--edit" data-id="${escHtml(p.id)}" title="Edit product">✏️</button>
            <button class="btn-icon btn-icon--delete" data-id="${escHtml(p.id)}" title="Delete product">🗑️</button>
          </td>
        </tr>
      `;
    }).join("");
  }

  // Bind Edit buttons
  tbody.querySelectorAll(".btn-icon--edit").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      const product = ProductsState.all.find(p => String(p.id) === String(id));
      if (product) openProductModal(product);
    });
  });

  // Bind Delete buttons
  tbody.querySelectorAll(".btn-icon--delete").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      const product = ProductsState.all.find(p => String(p.id) === String(id));
      const name = product ? product.name : id;
      if (window.confirm(`Delete product "${name}"? This action cannot be undone.`)) {
        try {
          await deleteDoc(doc(db, "products", id));
          await loadAllProducts();
        } catch (err) {
          alert("Error deleting product: " + err.message);
        }
      }
    });
  });

  // Pagination
  if (paginEl) {
    paginEl.innerHTML = "";
    if (totalPages > 1) {
      paginEl.appendChild(buildPagination(ProductsState.page, totalPages, (newPage) => {
        ProductsState.page = newPage;
        renderProductsTable();
      }));
    }
  }
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

function formatStockSummary(p) {
  if (p.hasSizes === false || p.hasSizes === "false") {
    return `<small>Stock: ${p.stock || 0}</small>`;
  }
  const parts = [];
  if (Number(p.xsStock) > 0) parts.push(`XS:${p.xsStock}`);
  if (Number(p.sStock) > 0) parts.push(`S:${p.sStock}`);
  if (Number(p.mStock) > 0) parts.push(`M:${p.mStock}`);
  if (Number(p.lStock) > 0) parts.push(`L:${p.lStock}`);
  if (Number(p.xlStock) > 0) parts.push(`XL:${p.xlStock}`);
  if (Number(p.xxlStock) > 0) parts.push(`XXL:${p.xxlStock}`);

  return parts.length > 0 ? `<small>${parts.join(" ")}</small>` : `<small class="text-danger">0 stock</small>`;
}

function openProductModal(product) {
  ProductsState.editingId = product ? product.id : null;

  const title = document.getElementById("modal-title");
  if (title) title.textContent = product ? "Edit Product" : "Add Product";

  const form = document.getElementById("product-form");
  if (form) form.reset();

  // ID field (editable only on creation)
  const idInput = document.getElementById("p-id");
  if (idInput) {
    idInput.value = product ? product.id : "";
    idInput.disabled = !!product;
  }

  setValue("p-name", product ? product.name : "");
  setValue("p-barcode", product ? (product.barcode || "") : "");
  setValue("p-category", product ? product.category : "");
  setValue("p-subcategory", product ? (product.subcategory || "") : "");
  setValue("p-price", product ? product.price : "");
  setValue("p-offer-price", product ? (product.offerPrice || "") : "");
  setValue("p-badge", product ? (product.badge || "") : "");
  setValue("p-image", product ? (product.image || "") : "");
  setValue("p-image2", product ? (product.image2 || "") : "");
  setValue("p-image3", product ? (product.image3 || "") : "");
  setValue("p-description", product ? (product.description || "") : "");
  setValue("p-material", product ? (product.material || "") : "");

  // Sizes toggle
  const hasSizesCheck = document.getElementById("p-has-sizes");
  const isSizeless = product && (product.hasSizes === false || product.hasSizes === "false");
  if (hasSizesCheck) {
    hasSizesCheck.checked = !isSizeless;
  }

  // Stock fields
  setValue("p-stock", product ? (product.stock || 0) : 0);
  setValue("p-xs-stock", product ? (product.xsStock || 0) : 0);
  setValue("p-s-stock", product ? (product.sStock || 0) : 0);
  setValue("p-m-stock", product ? (product.mStock || 0) : 0);
  setValue("p-l-stock", product ? (product.lStock || 0) : 0);
  setValue("p-xl-stock", product ? (product.xlStock || 0) : 0);
  setValue("p-xxl-stock", product ? (product.xxlStock || 0) : 0);

  // Featured check
  const featuredCheck = document.getElementById("p-featured");
  if (featuredCheck) {
    featuredCheck.checked = !!(product && product.featured);
  }

  updateSizeFieldsVisibility();
  openModal("product-modal");
}

function updateSizeFieldsVisibility() {
  const hasSizes = document.getElementById("p-has-sizes")?.checked;
  const sizedBlock = document.getElementById("sized-stock-block");
  const sizelessBlock = document.getElementById("sizeless-stock-block");

  if (sizedBlock) sizedBlock.style.display = hasSizes ? "grid" : "none";
  if (sizelessBlock) sizelessBlock.style.display = hasSizes ? "none" : "block";
}

async function saveProduct() {
  const saveBtn = document.getElementById("modal-save");
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = "Saving...";
  }

  try {
    const idInput = document.getElementById("p-id");
    const name = getValue("p-name").trim();
    const category = getValue("p-category").trim();
    const price = Number(getValue("p-price"));

    if (!name || !category || isNaN(price)) {
      alert("Please fill in required fields (Name, Category, Price).");
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = "Save Product"; }
      return;
    }

    const hasSizes = document.getElementById("p-has-sizes")?.checked;
    const offerPriceRaw = getValue("p-offer-price");

    const payload = {
      name: name,
      barcode: getValue("p-barcode").trim(),
      category: category,
      subcategory: getValue("p-subcategory").trim(),
      price: price,
      offerPrice: offerPriceRaw !== "" ? Number(offerPriceRaw) : null,
      badge: getValue("p-badge") || null,
      image: getValue("p-image").trim(),
      image2: getValue("p-image2").trim(),
      image3: getValue("p-image3").trim(),
      description: getValue("p-description").trim(),
      material: getValue("p-material").trim(),
      hasSizes: hasSizes,
      featured: !!document.getElementById("p-featured")?.checked,
    };

    if (hasSizes) {
      payload.xsStock = Number(getValue("p-xs-stock")) || 0;
      payload.sStock = Number(getValue("p-s-stock")) || 0;
      payload.mStock = Number(getValue("p-m-stock")) || 0;
      payload.lStock = Number(getValue("p-l-stock")) || 0;
      payload.xlStock = Number(getValue("p-xl-stock")) || 0;
      payload.xxlStock = Number(getValue("p-xxl-stock")) || 0;
      payload.stock = payload.xsStock + payload.sStock + payload.mStock + payload.lStock + payload.xlStock + payload.xxlStock;
    } else {
      payload.stock = Number(getValue("p-stock")) || 0;
      payload.xsStock = 0;
      payload.sStock = 0;
      payload.mStock = 0;
      payload.lStock = 0;
      payload.xlStock = 0;
      payload.xxlStock = 0;
    }

    if (ProductsState.editingId) {
      // Update existing document
      await updateDoc(doc(db, "products", ProductsState.editingId), payload);
    } else {
      // Create new document
      let customId = idInput ? idInput.value.trim() : "";
      if (!customId) {
        customId = category + "-" + Date.now().toString().slice(-6);
      }
      payload.createdAt = new Date().toISOString();
      await setDoc(doc(db, "products", customId), payload);
    }

    closeModal("product-modal");
    await loadAllProducts();

  } catch (err) {
    console.error("Save product error:", err);
    alert("Failed to save product: " + err.message);
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = "Save Product";
    }
  }
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
