const elements = {
  pageTitle: document.querySelector("#page-title"),
  unsupported: document.querySelector("#unsupported"),
  toolContent: document.querySelector("#tool-content"),
  popupTitle: document.querySelector("#popup-title"),
  productsTab: document.querySelector("#products-tab"),
  ordersTab: document.querySelector("#orders-tab"),
  ordersPanel: document.querySelector("#orders-panel"),
  orderContact: document.querySelector("#order-contact"),
  orderTools: document.querySelector("#order-tools"),
  orderSearch: document.querySelector("#order-search"),
  orderStatusFilter: document.querySelector("#order-status-filter"),
  refreshOrders: document.querySelector("#refresh-orders"),
  orderActionStatus: document.querySelector("#order-action-status"),
  orderList: document.querySelector("#order-list"),
  orderPagination: document.querySelector("#order-pagination"),
  orderPreviousPage: document.querySelector("#order-previous-page"),
  orderNextPage: document.querySelector("#order-next-page"),
  orderPageInfo: document.querySelector("#order-page-info"),
  ordersEmpty: document.querySelector("#orders-empty"),
  configureOrders: document.querySelector("#configure-orders"),
  retryOrders: document.querySelector("#retry-orders"),
  captchaPanel: document.querySelector("#captcha-panel"),
  captchaImage: document.querySelector("#captcha-image"),
  captchaCode: document.querySelector("#captcha-code"),
  captchaStatus: document.querySelector("#captcha-status"),
  startCaptcha: document.querySelector("#start-captcha"),
  refreshCaptcha: document.querySelector("#refresh-captcha"),
  verifyCaptcha: document.querySelector("#verify-captcha"),
  settings: document.querySelector("#settings"),
  productSortMode: document.querySelector("#product-sort-mode"),
  hideSoldOutToggle: document.querySelector("#hide-sold-out-toggle"),
  productSettingsStatus: document.querySelector("#product-settings-status"),
  orderSettingsForm: document.querySelector("#order-settings-form"),
  orderSettingsDisclosure: document.querySelector("#order-settings-disclosure"),
  orderConfigSummary: document.querySelector("#order-config-summary"),
  orderContactInput: document.querySelector("#order-contact-input"),
  orderPasswordInput: document.querySelector("#order-password-input"),
  rememberOrderPassword: document.querySelector("#remember-order-password"),
  saveOrderSettings: document.querySelector("#save-order-settings"),
  orderSettingsStatus: document.querySelector("#order-settings-status")
};

const FILTER_SETTING_KEY = "hideSoldOutProducts";
const PRODUCT_SORT_SETTING_KEY = "productSortMode";
const ORDER_CONTACT_SETTING_KEY = "orderContact";
const ORDER_PASSWORD_SETTING_KEY = "orderPassword";
const REMEMBER_ORDER_PASSWORD_SETTING_KEY = "rememberOrderPassword";
const SESSION_ORDER_PASSWORD_KEY = "sessionOrderPassword";
const ORDER_PAGE_SIZE = 10;
const ORDER_FETCH_PAGE_SIZE = 100;
const MAX_ORDER_FETCH_PAGES = 50;
let currentTabId = null;
let currentOrderPage = 1;
let orderContact = "";
let orderPassword = "";
let allOrders = [];
let ordersLoaded = false;
let ordersLoading = false;
let loadedOrderTotal = 0;

async function loadProductSettings() {
  const storage = chrome.storage?.local;
  if (!storage) return;
  const settings = await storage.get({
    [FILTER_SETTING_KEY]: true,
    [PRODUCT_SORT_SETTING_KEY]: "price-asc"
  });
  elements.hideSoldOutToggle.checked = Boolean(settings[FILTER_SETTING_KEY]);
  elements.productSortMode.value = ["default", "price-asc", "price-desc"].includes(settings[PRODUCT_SORT_SETTING_KEY])
    ? settings[PRODUCT_SORT_SETTING_KEY]
    : "price-asc";
}

async function loadOrderSettings() {
  const localStorage = chrome.storage?.local;
  if (!localStorage) return;
  const settings = await localStorage.get([
    ORDER_CONTACT_SETTING_KEY,
    ORDER_PASSWORD_SETTING_KEY,
    REMEMBER_ORDER_PASSWORD_SETTING_KEY
  ]);
  const localPassword = typeof settings[ORDER_PASSWORD_SETTING_KEY] === "string" ? settings[ORDER_PASSWORD_SETTING_KEY] : "";
  const hasRememberPreference = typeof settings[REMEMBER_ORDER_PASSWORD_SETTING_KEY] === "boolean";
  const rememberPassword = hasRememberPreference ? settings[REMEMBER_ORDER_PASSWORD_SETTING_KEY] : Boolean(localPassword);
  if (!hasRememberPreference && localPassword) {
    await localStorage.set({ [REMEMBER_ORDER_PASSWORD_SETTING_KEY]: true });
  }
  const sessionSettings = await chrome.storage?.session?.get({ [SESSION_ORDER_PASSWORD_KEY]: "" });
  orderContact = typeof settings[ORDER_CONTACT_SETTING_KEY] === "string" ? settings[ORDER_CONTACT_SETTING_KEY].trim() : "";
  orderPassword = rememberPassword ? localPassword : (sessionSettings?.[SESSION_ORDER_PASSWORD_KEY] || "");
  elements.rememberOrderPassword.checked = rememberPassword;
}

async function saveOrderSettings() {
  const contact = elements.orderContactInput.value.trim();
  const password = elements.orderPasswordInput.value;
  const rememberPassword = elements.rememberOrderPassword.checked;
  if (!contact) {
    elements.orderSettingsStatus.dataset.tone = "error";
    elements.orderSettingsStatus.textContent = "联系方式为空，请填写后再保存。";
    elements.orderContactInput.setAttribute("aria-invalid", "true");
    elements.orderContactInput.focus();
    return;
  }
  elements.orderContactInput.removeAttribute("aria-invalid");
  delete elements.orderSettingsStatus.dataset.tone;
  elements.saveOrderSettings.disabled = true;
  elements.saveOrderSettings.setAttribute("aria-busy", "true");
  elements.saveOrderSettings.textContent = "保存中";
  try {
    const contactChanged = contact !== orderContact;
    orderContact = contact;
    orderPassword = password;
    await chrome.storage.local.set({
      [ORDER_CONTACT_SETTING_KEY]: orderContact,
      [REMEMBER_ORDER_PASSWORD_SETTING_KEY]: rememberPassword
    });
    if (rememberPassword) {
      await chrome.storage.local.set({ [ORDER_PASSWORD_SETTING_KEY]: orderPassword });
      await chrome.storage.session.remove(SESSION_ORDER_PASSWORD_KEY);
    } else {
      await chrome.storage.local.remove(ORDER_PASSWORD_SETTING_KEY);
      await chrome.storage.session.set({ [SESSION_ORDER_PASSWORD_KEY]: orderPassword });
    }
    if (contactChanged) {
      ordersLoaded = false;
      allOrders = [];
    }
    elements.orderSettingsStatus.dataset.tone = "success";
    elements.orderSettingsStatus.textContent = rememberPassword ? "已保存到此设备" : "已保存到本次会话";
    updateOrderConfigSummary();
    if (currentTabId) chrome.tabs.sendMessage(currentTabId, { type: "refresh-order-autofill" }).catch(() => {});
  } finally {
    elements.saveOrderSettings.disabled = false;
    elements.saveOrderSettings.removeAttribute("aria-busy");
    elements.saveOrderSettings.textContent = "保存配置";
  }
}

function updateOrderConfigSummary() {
  elements.orderConfigSummary.textContent = orderContact
    ? `已配置 · ${elements.rememberOrderPassword.checked ? "设备保存" : "会话保存"}`
    : "未配置";
}

function isWzypUrl(url) {
  try {
    const hostname = new URL(url).hostname;
    return hostname === "wzyp.cn" || hostname.endsWith(".wzyp.cn");
  } catch {
    return false;
  }
}

function isOrderUrl(url) {
  try { return new URL(url).pathname === "/order"; }
  catch { return false; }
}

function orderStatus(status) {
  return { 0: "未付款", 1: "已付款", 2: "已关闭", 3: "已退款" }[status] || "未知状态";
}

function formatOrderTime(timestamp) {
  if (!timestamp) return "";
  const date = new Date(Number(timestamp) * 1000);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function openOrderDetails(tradeNo) {
  if (!tradeNo) return Promise.resolve();
  return chrome.tabs.create({ url: `https://wzyp.cn/order/result/${encodeURIComponent(tradeNo)}` });
}

async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const input = document.createElement("textarea");
  input.value = value;
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.append(input);
  input.select();
  const copied = document.execCommand("copy");
  input.remove();
  if (!copied) throw new Error("复制失败");
}

function setOrderActionStatus(message) {
  elements.orderActionStatus.textContent = message;
}

function button(label, className, onClick) {
  const element = document.createElement("button");
  element.type = "button";
  element.className = className;
  element.textContent = label;
  element.addEventListener("click", (event) => {
    event.stopPropagation();
    onClick(event);
  });
  return element;
}

function showTemporaryButtonState(element, label) {
  const previousLabel = element.textContent;
  element.dataset.state = "success";
  element.textContent = label;
  window.setTimeout(() => {
    if (!element.isConnected) return;
    delete element.dataset.state;
    element.textContent = previousLabel;
  }, 1800);
}

function renderOrderCards(container, cards, error, retry) {
  container.replaceChildren();
  if (error) {
    const row = document.createElement("div");
    row.className = "order-card-error";
    const message = document.createElement("p");
    message.className = "order-cards-status";
    message.textContent = error;
    row.append(message);
    if (retry) row.append(button("重试", "text-button", retry));
    container.append(row);
    return;
  }
  if (!cards.length) {
    const message = document.createElement("p");
    message.className = "order-cards-status";
    message.textContent = "该订单暂无卡密。";
    container.append(message);
    return;
  }

  let allRevealed = false;
  const codeViews = [];
  const toolbar = document.createElement("div");
  toolbar.className = "order-cards-toolbar";
  const revealAll = button("全部显示", "text-button", () => {
    allRevealed = !allRevealed;
    codeViews.forEach((view) => {
      view.revealed = allRevealed;
      view.codeView.textContent = allRevealed ? view.card : "************";
      view.revealButton.textContent = allRevealed ? "隐藏" : "显示";
    });
    revealAll.textContent = allRevealed ? "全部隐藏" : "全部显示";
  });
  const copyAll = button("复制全部", "text-button", () => {
    copyText(cards.join("\n"))
      .then(() => showTemporaryButtonState(copyAll, `已复制 ${cards.length} 条`))
      .catch(() => setOrderActionStatus("复制失败，请重试。"));
  });
  toolbar.append(revealAll, copyAll);
  container.append(toolbar);

  cards.forEach((card, index) => {
    const entry = document.createElement("div");
    entry.className = "order-card-entry";
    const label = document.createElement("span");
    label.className = "order-card-label";
    label.textContent = `卡密 ${index + 1}`;
    const codeView = document.createElement("code");
    codeView.className = "order-card-code";
    codeView.textContent = "************";
    const view = { card, codeView, revealed: false, revealButton: null };
    const reveal = button("显示", "text-button", () => {
      view.revealed = !view.revealed;
      codeView.textContent = view.revealed ? card : "************";
      reveal.textContent = view.revealed ? "隐藏" : "显示";
    });
    const copy = button("复制", "text-button", () => {
      copyText(card)
        .then(() => showTemporaryButtonState(copy, "已复制"))
        .catch(() => setOrderActionStatus("复制失败，请重试。"));
    });
    const actions = document.createElement("div");
    actions.className = "order-card-actions";
    actions.append(reveal, copy);
    entry.append(label, codeView, actions);
    view.revealButton = reveal;
    codeViews.push(view);
    container.append(entry);
  });
}

async function showOrderCards(order, container, trigger) {
  if (container.dataset.loaded === "true" || container.dataset.loading === "true") return;
  container.dataset.loading = "true";
  trigger.disabled = true;
  trigger.setAttribute("aria-busy", "true");
  trigger.textContent = "正在读取…";
  container.replaceChildren();
  const loading = document.createElement("p");
  loading.className = "order-cards-status";
  loading.textContent = "正在读取卡密…";
  container.append(loading);
  container.hidden = false;
  try {
    const result = await sendOrderMessage({ type: "get-order-cards", tradeNo: order.trade_no, password: orderPassword });
    if (result.error) throw new Error(result.error);
    renderOrderCards(container, result.cards || []);
    container.dataset.loaded = "true";
    trigger.textContent = "卡密已读取";
  } catch (error) {
    trigger.disabled = false;
    trigger.textContent = "读取卡密";
    renderOrderCards(container, [], error.message || "无法读取卡密", () => showOrderCards(order, container, trigger));
  } finally {
    delete container.dataset.loading;
    trigger.removeAttribute("aria-busy");
  }
}

function filteredOrders() {
  const keyword = elements.orderSearch.value.trim().toLocaleLowerCase("zh-CN");
  const status = elements.orderStatusFilter.value;
  return allOrders.filter((order) => {
    const matchesStatus = status === "all" || String(order.status) === status;
    const searchable = `${order.goods_name || ""} ${order.trade_no || ""}`.toLocaleLowerCase("zh-CN");
    return matchesStatus && (!keyword || searchable.includes(keyword));
  });
}

function renderOrderPagination(total) {
  const totalPages = Math.max(1, Math.ceil(total / ORDER_PAGE_SIZE));
  currentOrderPage = Math.min(Math.max(currentOrderPage, 1), totalPages);
  elements.orderPagination.hidden = totalPages <= 1;
  elements.orderPageInfo.textContent = `${currentOrderPage} / ${totalPages}`;
  elements.orderPreviousPage.disabled = currentOrderPage === 1;
  elements.orderNextPage.disabled = currentOrderPage === totalPages;
}

function renderOrderItem(order) {
  const item = document.createElement("article");
  item.className = "order-item";
  const heading = document.createElement("div");
  heading.className = "order-item-heading";
  const product = document.createElement("strong");
  product.textContent = order.goods_name || "未命名商品";
  product.title = product.textContent;
  const detailsButton = button("↗", "order-detail-button", () => openOrderDetails(order.trade_no).catch(() => {}));
  detailsButton.title = "打开订单详情";
  detailsButton.setAttribute("aria-label", "打开订单详情");
  detailsButton.disabled = !order.trade_no;
  heading.append(product, detailsButton);
  const meta = document.createElement("div");
  meta.className = "order-meta";
  const status = document.createElement("span");
  status.className = "order-status";
  status.dataset.status = String(order.status);
  status.textContent = orderStatus(order.status);
  const amount = document.createElement("span");
  amount.className = "order-amount";
  amount.textContent = `¥${order.total_amount || "0.00"}`;
  const time = document.createElement("span");
  time.className = "order-time";
  time.textContent = formatOrderTime(order.create_time);
  meta.append(status, amount, time);
  const number = document.createElement("p");
  number.className = "order-number";
  number.textContent = order.trade_no || "无订单号";
  number.title = order.trade_no ? `订单号：${order.trade_no}` : "无订单号";
  const cards = document.createElement("div");
  cards.className = "order-cards";
  cards.hidden = true;
  const cardsButton = button("读取卡密", "secondary-button order-cards-button", () => showOrderCards(order, cards, cardsButton));
  cardsButton.disabled = !order.trade_no;
  const footer = document.createElement("div");
  footer.className = "order-item-footer";
  footer.append(number, cardsButton);
  item.append(heading, meta, footer, cards);
  return item;
}

function renderOrderSkeletons() {
  const skeletons = Array.from({ length: 3 }, () => {
    const item = document.createElement("article");
    item.className = "order-item order-skeleton";
    item.setAttribute("aria-hidden", "true");
    ["title", "meta", "footer"].forEach((name) => {
      const line = document.createElement("span");
      line.className = `skeleton-line skeleton-line--${name}`;
      item.append(line);
    });
    return item;
  });
  elements.orderList.replaceChildren(...skeletons);
}

function renderOrders() {
  const orders = filteredOrders();
  const totalPages = Math.max(1, Math.ceil(orders.length / ORDER_PAGE_SIZE));
  currentOrderPage = Math.min(currentOrderPage, totalPages);
  const start = (currentOrderPage - 1) * ORDER_PAGE_SIZE;
  const pageOrders = orders.slice(start, start + ORDER_PAGE_SIZE);
  elements.orderList.replaceChildren(...pageOrders.map(renderOrderItem));
  elements.ordersEmpty.hidden = pageOrders.length > 0;
  elements.ordersEmpty.textContent = allOrders.length ? "没有符合筛选条件的订单。" : "未查询到订单。";
  elements.retryOrders.hidden = true;
  elements.configureOrders.hidden = true;
  elements.orderTools.hidden = false;
  elements.orderContact.textContent = `${orderContact} · ${loadedOrderTotal || allOrders.length} 笔`;
  setOrderActionStatus(orders.length === allOrders.length ? "" : `已筛选出 ${orders.length} 笔订单。`);
  renderOrderPagination(orders.length);
}

function showOrdersMessage(title, message, { verification = false, retry = false, configure = false, loading = false } = {}) {
  if (loading) renderOrderSkeletons();
  else elements.orderList.replaceChildren();
  elements.orderContact.textContent = title;
  elements.orderTools.hidden = true;
  elements.orderPagination.hidden = true;
  elements.captchaPanel.hidden = true;
  elements.startCaptcha.hidden = !verification;
  elements.ordersEmpty.textContent = message;
  elements.ordersEmpty.hidden = loading;
  elements.configureOrders.hidden = !configure;
  elements.retryOrders.hidden = !retry;
  setOrderActionStatus("");
}

async function sendOrderMessage(message) {
  if (!currentTabId) throw new Error("当前页面不可用");
  return chrome.tabs.sendMessage(currentTabId, message);
}

async function fetchAllOrders(firstPage) {
  const pageCount = Math.min(Math.ceil((Number(firstPage.total) || 0) / ORDER_FETCH_PAGE_SIZE), MAX_ORDER_FETCH_PAGES);
  const orders = [...(firstPage.orders || [])];
  for (let startPage = 2; startPage <= pageCount; startPage += 4) {
    const pages = Array.from({ length: Math.min(4, pageCount - startPage + 1) }, (_value, index) => startPage + index);
    const results = await Promise.all(pages.map((page) => sendOrderMessage({
      type: "get-order-info",
      contact: orderContact,
      page,
      pageSize: ORDER_FETCH_PAGE_SIZE
    })));
    const failed = results.find((result) => result.error || result.requiresVerification);
    if (failed?.requiresVerification) return failed;
    if (failed?.error) throw new Error(failed.error);
    results.forEach((result) => orders.push(...(result.orders || [])));
  }
  return { orders, truncated: pageCount * ORDER_FETCH_PAGE_SIZE < Number(firstPage.total) };
}

async function loadOrders(force = false) {
  if (ordersLoading || (ordersLoaded && !force)) {
    if (ordersLoaded) renderOrders();
    return;
  }
  if (!orderContact) {
    showOrdersMessage("尚未配置联系方式", "配置联系方式后即可查询订单。", { configure: true });
    return;
  }
  ordersLoading = true;
  elements.refreshOrders.disabled = true;
  showOrdersMessage("正在查询订单…", "", { loading: true });
  try {
    const firstPage = await sendOrderMessage({ type: "get-order-info", contact: orderContact, page: 1, pageSize: ORDER_FETCH_PAGE_SIZE });
    if (firstPage.requiresVerification) {
      ordersLoaded = false;
      showOrdersMessage("需要完成人机验证。", "验证完成后将自动显示订单。", { verification: true });
      return;
    }
    if (firstPage.error) throw new Error(firstPage.error);
    const result = await fetchAllOrders(firstPage);
    if (result.requiresVerification) {
      ordersLoaded = false;
      showOrdersMessage("验证已过期。", "请重新完成人机验证。", { verification: true });
      return;
    }
    allOrders = result.orders;
    loadedOrderTotal = Number(firstPage.total) || allOrders.length;
    ordersLoaded = true;
    currentOrderPage = 1;
    renderOrders();
    if (result.truncated) setOrderActionStatus(`订单较多，已加载最近 ${allOrders.length} 笔。`);
  } catch (error) {
    ordersLoaded = false;
    showOrdersMessage("订单查询失败。", error.message || "请刷新当前网页后重试。", { retry: true });
  } finally {
    ordersLoading = false;
    elements.refreshOrders.disabled = false;
  }
}

async function loadCaptcha() {
  elements.captchaPanel.hidden = false;
  elements.ordersEmpty.hidden = true;
  elements.startCaptcha.hidden = true;
  elements.retryOrders.hidden = true;
  elements.captchaStatus.textContent = "正在加载验证码…";
  elements.verifyCaptcha.disabled = true;
  elements.verifyCaptcha.removeAttribute("aria-busy");
  elements.verifyCaptcha.textContent = "验证并查询";
  const captcha = await sendOrderMessage({ type: "start-order-captcha" });
  if (captcha.error) throw new Error(captcha.error);
  elements.captchaImage.src = captcha.imageUrl;
  elements.captchaCode.value = "";
  elements.captchaStatus.textContent = "";
  elements.verifyCaptcha.disabled = false;
  elements.captchaCode.focus();
}

async function verifyCaptcha() {
  const code = elements.captchaCode.value.trim();
  if (!code) { elements.captchaStatus.textContent = "请输入验证码。"; return; }
  elements.verifyCaptcha.disabled = true;
  elements.verifyCaptcha.setAttribute("aria-busy", "true");
  elements.verifyCaptcha.textContent = "验证中…";
  elements.captchaStatus.textContent = "正在验证…";
  const result = await sendOrderMessage({ type: "verify-order-captcha", code });
  if (!result.verified) {
    elements.captchaStatus.textContent = result.error || "验证码不正确，请重试。";
    if (result.imageUrl) elements.captchaImage.src = result.imageUrl;
    elements.verifyCaptcha.disabled = false;
    elements.verifyCaptcha.removeAttribute("aria-busy");
    elements.verifyCaptcha.textContent = "验证并查询";
    elements.captchaCode.focus();
    return;
  }
  elements.captchaPanel.hidden = true;
  await loadOrders(true);
}

async function showOrders() {
  elements.ordersPanel.hidden = false;
  elements.settings.hidden = true;
  elements.productsTab.setAttribute("aria-selected", "false");
  elements.productsTab.tabIndex = -1;
  elements.ordersTab.setAttribute("aria-selected", "true");
  elements.ordersTab.tabIndex = 0;
  await loadOrders();
}

function productStatusText(state) {
  if (!state?.supported) return "商品整理仅在链动小铺首页生效。";
  const sortLabels = { default: "网站默认顺序", "price-asc": "价格从低到高", "price-desc": "价格从高到低" };
  const hiddenText = state.filterEnabled ? `，已隐藏 ${state.hidden || 0} 件缺货商品` : "，缺货商品已显示";
  return `${sortLabels[state.sortMode] || "价格从低到高"}${hiddenText}。`;
}

async function updateProductPreferences(type) {
  elements.productSettingsStatus.textContent = "正在应用…";
  await chrome.storage.local.set({
    [FILTER_SETTING_KEY]: elements.hideSoldOutToggle.checked,
    [PRODUCT_SORT_SETTING_KEY]: elements.productSortMode.value
  });
  if (!currentTabId) return;
  const message = type === "sort"
    ? { type: "set-product-sort", mode: elements.productSortMode.value }
    : { type: "set-product-filter", enabled: elements.hideSoldOutToggle.checked };
  const state = await chrome.tabs.sendMessage(currentTabId, message);
  elements.productSettingsStatus.textContent = productStatusText(state);
}

async function refreshProductState() {
  if (!currentTabId) return;
  const state = await chrome.tabs.sendMessage(currentTabId, { type: "get-product-state" });
  elements.productSettingsStatus.textContent = productStatusText(state);
}

function showProducts() {
  elements.ordersPanel.hidden = true;
  elements.settings.hidden = false;
  elements.productsTab.setAttribute("aria-selected", "true");
  elements.productsTab.tabIndex = 0;
  elements.ordersTab.setAttribute("aria-selected", "false");
  elements.ordersTab.tabIndex = -1;
  refreshProductState().catch(() => { elements.productSettingsStatus.textContent = "刷新网页后即可应用商品设置。"; });
}

async function initialize() {
  await Promise.all([loadProductSettings(), loadOrderSettings()]);
  elements.orderContactInput.value = orderContact;
  elements.orderPasswordInput.value = orderPassword;
  updateOrderConfigSummary();
  elements.orderSettingsDisclosure.open = !orderContact;
  const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  elements.pageTitle.textContent = currentTab?.title || "未命名页面";
  const supported = isWzypUrl(currentTab?.url || "");
  const orderPage = isOrderUrl(currentTab?.url || "");
  elements.unsupported.hidden = supported;
  elements.toolContent.hidden = !supported;
  if (!supported || !currentTab?.id) return;
  currentTabId = currentTab.id;
  if (orderPage) await showOrders();
  else showProducts();
}

elements.hideSoldOutToggle.addEventListener("change", () => updateProductPreferences("filter").catch(() => {
  elements.productSettingsStatus.textContent = "应用失败，请刷新网页后重试。";
}));
elements.productSortMode.addEventListener("change", () => updateProductPreferences("sort").catch(() => {
  elements.productSettingsStatus.textContent = "应用失败，请刷新网页后重试。";
}));
elements.orderSettingsForm.addEventListener("submit", (event) => {
  event.preventDefault();
  saveOrderSettings().catch((error) => {
    elements.orderSettingsStatus.dataset.tone = "error";
    elements.orderSettingsStatus.textContent = error.message || "配置保存失败，请重试。";
  });
});
elements.orderContactInput.addEventListener("input", () => {
  elements.orderContactInput.removeAttribute("aria-invalid");
  if (elements.orderSettingsStatus.dataset.tone === "error") {
    delete elements.orderSettingsStatus.dataset.tone;
    elements.orderSettingsStatus.textContent = "";
  }
});
elements.rememberOrderPassword.addEventListener("change", updateOrderConfigSummary);
elements.startCaptcha.addEventListener("click", () => loadCaptcha().catch((error) => { elements.captchaStatus.textContent = error.message || "无法加载验证码。"; }));
elements.refreshCaptcha.addEventListener("click", () => loadCaptcha().catch((error) => { elements.captchaStatus.textContent = error.message || "无法刷新验证码。"; }));
elements.verifyCaptcha.addEventListener("click", () => verifyCaptcha().catch((error) => {
  elements.captchaStatus.textContent = error.message || "验证失败。";
  elements.verifyCaptcha.disabled = false;
  elements.verifyCaptcha.removeAttribute("aria-busy");
  elements.verifyCaptcha.textContent = "验证并查询";
}));
elements.captchaCode.addEventListener("keydown", (event) => { if (event.key === "Enter") verifyCaptcha().catch(() => {}); });
elements.productsTab.addEventListener("click", showProducts);
elements.ordersTab.addEventListener("click", () => showOrders().catch(() => showOrdersMessage("订单查询失败。", "请刷新当前网页后重试。", { retry: true })));
elements.configureOrders.addEventListener("click", () => {
  showProducts();
  elements.orderSettingsDisclosure.open = true;
  elements.orderContactInput.focus();
});
elements.productsTab.parentElement.addEventListener("keydown", (event) => {
  if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
  event.preventDefault();
  const showNext = elements.productsTab.getAttribute("aria-selected") === "true";
  const nextTab = showNext ? elements.ordersTab : elements.productsTab;
  nextTab.focus({ preventScroll: true });
  nextTab.click();
});
elements.orderSearch.addEventListener("input", () => { currentOrderPage = 1; renderOrders(); });
elements.orderStatusFilter.addEventListener("change", () => { currentOrderPage = 1; renderOrders(); });
elements.refreshOrders.addEventListener("click", () => loadOrders(true));
elements.retryOrders.addEventListener("click", () => loadOrders(true));
elements.orderPreviousPage.addEventListener("click", () => { currentOrderPage -= 1; renderOrders(); });
elements.orderNextPage.addEventListener("click", () => { currentOrderPage += 1; renderOrders(); });

initialize().catch((error) => {
  elements.unsupported.hidden = false;
  elements.unsupported.textContent = error.message || "扩展初始化失败，请重试。";
});
