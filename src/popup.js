const $ = (selector) => document.querySelector(selector);
const icon = (name) => `<svg aria-hidden="true"><use href="#i-${name}"></use></svg>`;
const state = { orders: [], page: 1, perPage: 8, cards: new Map(), password: "", view: "products" };

function setStatus(id, message = "", type = "") {
  const node = $(id);
  node.textContent = message;
  node.className = `status ${type}`;
}

function send(message) {
  return new Promise((resolve, reject) => chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (!tab?.id) return reject(new Error("无法读取当前标签页"));
    chrome.tabs.sendMessage(tab.id, message, (response) => chrome.runtime.lastError ? reject(new Error("请刷新当前小铺页面后重试。")) : resolve(response || {}));
  }));
}

function orderName(order) { return order.goods_name || order.name || order.title || "未命名商品"; }
function orderNo(order) { return order.trade_no || order.order_no || order.tradeNo || "--"; }
function orderPaid(order) { return String(order.status ?? order.pay_status ?? "") === "1"; }
function orderAmount(order) {
  const raw = order.actual_price ?? order.pay_price ?? order.total_price ?? order.amount ?? order.price ?? order.money;
  const amount = Number.parseFloat(raw);
  return Number.isFinite(amount) ? `¥${amount.toFixed(2)}` : "--";
}
function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]); }
function formatTime(value) {
  if (!value) return "--";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}  ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function updateChrome() {
  $("#app").dataset.view = state.view;
  $("#app").classList.toggle("orders-loaded", state.view === "orders" && !$("#orders-panel").hidden);
  $("#header-action").ariaLabel = state.view === "settings" ? "关闭自动填写配置" : state.view === "orders" && !$("#orders-panel").hidden ? "刷新订单" : state.view === "orders" ? "安全连接" : "打开自动填写配置";
}

function activate(view) {
  state.view = view;
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.view === view));
  document.querySelectorAll(".view").forEach((panel) => panel.classList.toggle("active", panel.id === view));
  updateChrome();
  if (view === "orders") openOrders().catch((error) => showVerify(error.message));
}

function setSortCopy(mode) {
  const copy = {
    "price-asc": ["价格从低到高", "低价商品优先"],
    "price-desc": ["价格从高到低", "高价商品优先"],
    default: ["网站默认顺序", "恢复页面原始排列"]
  }[mode] || ["价格从低到高", "低价商品优先"];
  $("#sort-label").textContent = copy[0];
  $("#sort-hint").textContent = copy[1];
}

function updateAutofillStatus(contact, remembered) {
  $("#autofill-status").textContent = contact ? `已配置 · ${remembered ? "此设备" : "会话保存"}` : "尚未配置";
}

async function hydrateSettings() {
  const saved = await chrome.storage.local.get({ orderContact: "", orderPassword: "", rememberOrderPassword: false });
  const session = await new Promise((resolve) => chrome.runtime.sendMessage({ type: "session-password", action: "get" }, resolve));
  $("#contact").value = saved.orderContact;
  $("#remember-password").checked = saved.rememberOrderPassword;
  $("#session-password").checked = !saved.rememberOrderPassword;
  state.password = saved.rememberOrderPassword ? saved.orderPassword : (session?.value || "");
  $("#password").value = state.password;
  $("#order-contact-display").textContent = saved.orderContact || "请先设置联系方式";
  updateAutofillStatus(saved.orderContact, saved.rememberOrderPassword);
}

async function loadProductState() {
  const product = await send({ type: "get-product-state" });
  const total = product.total || 0;
  const hidden = product.hidden || 0;
  $("#hide-sold-out").checked = Boolean(product.filterEnabled);
  $("#product-sort").value = product.sortMode || "price-asc";
  $("#product-count").textContent = `${total} 件商品`;
  $("#sold-out-count").textContent = `${hidden} 件缺货`;
  $("#hidden-hint").textContent = product.filterEnabled ? "仅显示可立即购买的商品" : "显示全部商品";
  $("#sync-detail").textContent = product.filterEnabled ? `已重新排列 ${Math.max(0, total - hidden)} 件可售商品` : `已重新排列 ${total} 件商品`;
  $("#product-sync-time").textContent = `最后同步 ${new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false })}`;
  setSortCopy($("#product-sort").value);
  return product;
}

async function saveSettings() {
  const contact = $("#contact").value.trim();
  const password = $("#password").value;
  const remember = $("#remember-password").checked;
  await chrome.storage.local.set({ orderContact: contact, rememberOrderPassword: remember, ...(remember ? { orderPassword: password } : {}) });
  if (!remember) await chrome.storage.local.remove("orderPassword");
  await new Promise((resolve) => chrome.runtime.sendMessage({ type: "session-password", action: "set", value: password }, resolve));
  state.password = password;
  $("#order-contact-display").textContent = contact || "请先设置联系方式";
  updateAutofillStatus(contact, remember);
  await send({ type: "refresh-order-autofill" }).catch(() => {});
  setStatus("#settings-status", "配置已保存并同步至当前页面。", "success");
}

function showVerify(message = "") {
  $("#verify-panel").hidden = false;
  $("#orders-panel").hidden = true;
  updateChrome();
  if (message) setStatus("#captcha-status", message, "error");
}

async function openOrders() {
  const { orderContact } = await chrome.storage.local.get({ orderContact: "" });
  $("#order-contact-display").textContent = orderContact || "请先设置联系方式";
  if (!orderContact) return showVerify("请先在自动填写中填写联系方式。");
  await loadOrders();
}

async function startCaptcha() {
  setStatus("#captcha-status", "正在获取验证码...");
  const result = await send({ type: "start-order-captcha" });
  if (result.error) throw new Error(result.error);
  $("#captcha-image").src = result.imageUrl;
  $("#captcha-empty").hidden = true;
  $("#captcha-form").hidden = false;
  $("#captcha-code").focus();
  setStatus("#captcha-status");
}

async function verifyCaptcha() {
  const code = $("#captcha-code").value.trim();
  if (!code) return setStatus("#captcha-status", "请输入验证码。", "error");
  setStatus("#captcha-status", "正在验证...");
  const result = await send({ type: "verify-order-captcha", code });
  if (result.verified) {
    setStatus("#captcha-status", "验证通过，正在读取订单...", "success");
    await loadOrders();
    return;
  }
  if (result.imageUrl) $("#captcha-image").src = result.imageUrl;
  setStatus("#captcha-status", result.error || "验证失败，请重试。", "error");
}

async function loadOrders() {
  const { orderContact } = await chrome.storage.local.get({ orderContact: "" });
  if (!orderContact) return showVerify("请先在自动填写中填写联系方式。");
  setStatus("#orders-status", "正在读取订单...");
  const result = await send({ type: "get-order-info", contact: orderContact, page: 1, pageSize: 100 });
  if (result.requiresVerification) return showVerify();
  if (result.error) return showVerify(result.error);
  state.orders = result.orders || [];
  state.page = 1;
  $("#verify-panel").hidden = true;
  $("#orders-panel").hidden = false;
  $("#orders-subtitle").textContent = orderContact;
  $("#order-total").textContent = result.total ?? state.orders.length;
  state.cards.clear();
  updateChrome();
  renderOrdersWithCards();
  setStatus("#orders-status", state.orders.length ? "" : "暂无匹配订单。");
}

function filteredOrders() {
  const search = $("#order-search").value.trim().toLowerCase();
  const filter = $("#order-filter").value;
  return state.orders.filter((order) => (!search || `${orderName(order)} ${orderNo(order)}`.toLowerCase().includes(search)) && (filter === "all" || (filter === "paid") === orderPaid(order)));
}

function renderCardSection(no, card) {
  if (!card || card.loading) return '<div class="card-section"><div class="card-toolbar"><strong>卡密</strong></div><span class="card-loading">正在读取卡密...</span></div>';
  if (card.error) return `<div class="card-section"><div class="card-toolbar"><strong>卡密</strong></div><span class="card-loading error">${escapeHtml(card.error)}</span></div>`;
  if (!card.values.length) return '<div class="card-section"><div class="card-toolbar"><strong>卡密&nbsp; · &nbsp;0 条</strong></div><span class="card-loading">暂无可用卡密</span></div>';
  const allVisible = card.values.length > 0 && card.values.every((_, index) => card.visible.has(index));
  const rows = card.values.map((value, index) => {
    const revealed = card.visible.has(index);
    return `<div class="card-row"><div class="card-content"><span class="card-index">${String(index + 1).padStart(2, "0")}</span><span class="card-value">${revealed ? escapeHtml(value) : "•••• •••• ••••"}</span></div><div class="card-row-actions"><button data-card-show="${index}" data-no="${escapeHtml(no)}" type="button" aria-label="${revealed ? "隐藏" : "显示"}第 ${index + 1} 条卡密">${icon("eye")}</button><button data-card-copy="${index}" data-no="${escapeHtml(no)}" type="button" aria-label="复制第 ${index + 1} 条卡密">${icon("copy")}</button></div></div>`;
  }).join("");
  return `<div class="card-section"><div class="card-toolbar"><strong>卡密&nbsp; · &nbsp;${card.values.length} 条</strong><div class="card-toolbar-actions"><button data-show-all="${escapeHtml(no)}" type="button">${icon("eye")}${allVisible ? "全部隐藏" : "全部显示"}</button><button data-copy-all="${escapeHtml(no)}" type="button">${icon("copy")}复制全部</button></div></div>${rows}</div>`;
}

function currentPageOrders() {
  const orders = filteredOrders();
  const pages = Math.max(1, Math.ceil(orders.length / state.perPage));
  state.page = Math.min(state.page, pages);
  const current = orders.slice((state.page - 1) * state.perPage, state.page * state.perPage);
  return { orders, pages, current };
}

function renderOrders() {
  const { orders, pages, current } = currentPageOrders();
  const list = $("#order-list");
  $("#orders-empty").hidden = orders.length > 0;
  list.hidden = orders.length === 0;
  list.innerHTML = current.map((order) => {
    const no = orderNo(order);
    const paid = orderPaid(order);
    const card = state.cards.get(no);
    return `<article class="order"><div class="order-top"><div class="order-title"><span class="order-name">${escapeHtml(orderName(order))}</span><div class="order-submeta"><span class="badge ${paid ? "paid" : ""}">${paid ? "已付款" : "未付款"}</span><span class="order-time">${escapeHtml(formatTime(order.create_time || order.created_at))}</span></div></div></div><div class="order-info"><span class="order-no">NO. ${escapeHtml(no)}</span><span class="order-amount">${escapeHtml(orderAmount(order))}</span></div>${paid ? renderCardSection(no, card) : ""}</article>`;
  }).join("");
  $("#pagination").hidden = orders.length <= state.perPage;
  $("#page-label").textContent = `${state.page} / ${pages}`;
  $("#previous-page").disabled = state.page === 1;
  $("#next-page").disabled = state.page === pages;
}

async function loadVisibleCards() {
  const pending = currentPageOrders().current.filter(orderPaid).map(orderNo).filter((no) => !state.cards.has(no));
  if (!pending.length) return;
  pending.forEach((no) => state.cards.set(no, { loading: true, values: [], visible: new Set() }));
  renderOrders();
  await Promise.all(pending.map(async (no) => {
    try {
      const result = await send({ type: "get-order-cards", tradeNo: no, password: state.password });
      state.cards.set(no, result.error
        ? { loading: false, values: [], visible: new Set(), error: result.error }
        : { loading: false, values: result.cards || [], visible: new Set() });
    } catch (error) {
      state.cards.set(no, { loading: false, values: [], visible: new Set(), error: error.message });
    }
  }));
  renderOrders();
}

function renderOrdersWithCards() {
  renderOrders();
  loadVisibleCards().catch((error) => setStatus("#orders-status", error.message, "error"));
}

function copyText(value) {
  return navigator.clipboard.writeText(value).then(() => setStatus("#orders-status", "已复制到剪贴板。", "success")).catch(() => setStatus("#orders-status", "复制失败，请重试。", "error"));
}

document.addEventListener("DOMContentLoaded", async () => {
  document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => activate(tab.dataset.view)));
  $("#open-settings").addEventListener("click", () => activate("settings"));
  $("#back-products").addEventListener("click", () => activate("products"));
  $("#header-action").addEventListener("click", () => {
    if (state.view === "settings") activate("products");
    else if (state.view === "products") activate("settings");
    else if (!$("#orders-panel").hidden) loadOrders().catch((error) => setStatus("#orders-status", error.message, "error"));
  });
  $("#hide-sold-out").addEventListener("change", async (event) => {
    try {
      const result = await send({ type: "set-product-filter", enabled: event.target.checked });
      await loadProductState();
      $("#sold-out-count").textContent = `${result.hidden || 0} 件缺货`;
    } catch (error) {
      setStatus("#product-status", error.message, "error");
    }
  });
  $("#product-sort").addEventListener("change", async (event) => {
    try {
      setSortCopy(event.target.value);
      await send({ type: "set-product-sort", mode: event.target.value });
      await loadProductState();
    } catch (error) {
      setStatus("#product-status", error.message, "error");
    }
  });
  $("#reapply-products").addEventListener("click", async () => {
    try {
      $("#product-sync-time").textContent = "正在重新应用...";
      await Promise.all([send({ type: "set-product-filter", enabled: $("#hide-sold-out").checked }), send({ type: "set-product-sort", mode: $("#product-sort").value })]);
      await loadProductState();
      setStatus("#product-status");
    } catch (error) {
      setStatus("#product-status", error.message, "error");
    }
  });
  $("#save-settings").addEventListener("click", () => saveSettings().catch((error) => setStatus("#settings-status", error.message, "error")));
  $("#toggle-password").addEventListener("click", () => {
    const input = $("#password");
    input.type = input.type === "password" ? "text" : "password";
    $("#toggle-password").ariaLabel = input.type === "password" ? "显示密码" : "隐藏密码";
  });
  $("#start-captcha").addEventListener("click", () => startCaptcha().catch((error) => setStatus("#captcha-status", error.message, "error")));
  $("#refresh-captcha").addEventListener("click", () => startCaptcha().catch((error) => setStatus("#captcha-status", error.message, "error")));
  $("#verify-captcha").addEventListener("click", () => verifyCaptcha().catch((error) => setStatus("#captcha-status", error.message, "error")));
  $("#captcha-code").addEventListener("keydown", (event) => { if (event.key === "Enter") $("#verify-captcha").click(); });
  document.querySelectorAll("[data-go-settings]").forEach((button) => button.addEventListener("click", () => activate("settings")));
  $("#order-search").addEventListener("input", () => { state.page = 1; renderOrdersWithCards(); });
  $("#order-filter").addEventListener("change", () => { state.page = 1; renderOrdersWithCards(); });
  $("#previous-page").addEventListener("click", () => { state.page -= 1; renderOrdersWithCards(); });
  $("#next-page").addEventListener("click", () => { state.page += 1; renderOrdersWithCards(); });
  $("#order-list").addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.showAll) {
      const card = state.cards.get(button.dataset.showAll);
      const allVisible = card.values.every((_, index) => card.visible.has(index));
      card.visible = new Set(allVisible ? [] : card.values.map((_, index) => index));
      return renderOrders();
    }
    if (button.dataset.copyAll) return copyText(state.cards.get(button.dataset.copyAll).values.join("\n"));
    const no = button.dataset.no;
    const index = Number(button.dataset.cardShow ?? button.dataset.cardCopy);
    const card = state.cards.get(no);
    if (button.dataset.cardCopy !== undefined) return copyText(card.values[index]);
    if (card.visible.has(index)) card.visible.delete(index); else card.visible.add(index);
    renderOrders();
  });

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const valid = /^https:\/\/([\w-]+\.)*wzyp\.cn\//.test(tab?.url || "");
    $("#workspace").hidden = !valid;
    $("#unsupported").hidden = valid;
    if (valid) await Promise.all([hydrateSettings(), loadProductState()]);
  } catch {
    $("#workspace").hidden = true;
    $("#unsupported").hidden = false;
  }
});
