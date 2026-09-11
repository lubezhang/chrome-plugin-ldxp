const elements = {
  pageTitle: document.querySelector("#page-title"),
  unsupported: document.querySelector("#unsupported"),
  toolContent: document.querySelector("#tool-content"),
  popupTitle: document.querySelector("#popup-title"),
  productsTab: document.querySelector("#products-tab"),
  ordersTab: document.querySelector("#orders-tab"),
  ordersPanel: document.querySelector("#orders-panel"),
  orderContact: document.querySelector("#order-contact"),
  orderList: document.querySelector("#order-list"),
  orderPagination: document.querySelector("#order-pagination"),
  orderPreviousPage: document.querySelector("#order-previous-page"),
  orderNextPage: document.querySelector("#order-next-page"),
  orderPageInfo: document.querySelector("#order-page-info"),
  ordersEmpty: document.querySelector("#orders-empty"),
  captchaPanel: document.querySelector("#captcha-panel"),
  captchaImage: document.querySelector("#captcha-image"),
  captchaCode: document.querySelector("#captcha-code"),
  captchaStatus: document.querySelector("#captcha-status"),
  startCaptcha: document.querySelector("#start-captcha"),
  refreshCaptcha: document.querySelector("#refresh-captcha"),
  verifyCaptcha: document.querySelector("#verify-captcha"),
  settings: document.querySelector("#settings"),
  hideSoldOutToggle: document.querySelector("#hide-sold-out-toggle"),
  orderSettingsForm: document.querySelector("#order-settings-form"),
  orderContactInput: document.querySelector("#order-contact-input"),
  orderPasswordInput: document.querySelector("#order-password-input"),
  orderSettingsStatus: document.querySelector("#order-settings-status")
};

const FILTER_SETTING_KEY = "hideSoldOutProducts";
const ORDER_CONTACT_SETTING_KEY = "orderContact";
const ORDER_PASSWORD_SETTING_KEY = "orderPassword";
const ORDER_PAGE_SIZE = 10;
let currentTabId = null;
let currentOrderPage = 1;
let orderContact = "";
let orderPassword = "";

async function getFilterSetting() {
  const storage = chrome.storage?.local;
  if (!storage) return true;
  const savedSettings = await storage.get({ [FILTER_SETTING_KEY]: true });
  return savedSettings[FILTER_SETTING_KEY];
}

async function loadOrderSettings() {
  const storage = chrome.storage?.local;
  if (!storage) return;
  const settings = await storage.get({
    [ORDER_CONTACT_SETTING_KEY]: "",
    [ORDER_PASSWORD_SETTING_KEY]: ""
  });
  orderContact = typeof settings[ORDER_CONTACT_SETTING_KEY] === "string" && settings[ORDER_CONTACT_SETTING_KEY].trim()
    ? settings[ORDER_CONTACT_SETTING_KEY].trim()
    : "";
  orderPassword = typeof settings[ORDER_PASSWORD_SETTING_KEY] === "string" && settings[ORDER_PASSWORD_SETTING_KEY]
    ? settings[ORDER_PASSWORD_SETTING_KEY]
    : "";
}

async function saveOrderSettings() {
  const contact = elements.orderContactInput.value.trim();
  const password = elements.orderPasswordInput.value;
  if (!contact) {
    elements.orderSettingsStatus.textContent = "请输入联系方式。";
    elements.orderContactInput.focus();
    return;
  }
  orderContact = contact;
  orderPassword = password;
  await chrome.storage?.local?.set({
    [ORDER_CONTACT_SETTING_KEY]: orderContact,
    [ORDER_PASSWORD_SETTING_KEY]: orderPassword
  });
  elements.orderSettingsStatus.textContent = "已保存。";
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
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(Number(timestamp) * 1000));
}

function openOrderDetails(tradeNo) {
  if (!tradeNo) return;
  return chrome.tabs.create({
    url: `https://wzyp.cn/order/result/${encodeURIComponent(tradeNo)}`
  });
}

function renderOrderCards(container, cards, error) {
  container.replaceChildren();
  if (error) {
    const message = document.createElement("p");
    message.className = "order-cards-status";
    message.textContent = error;
    container.append(message);
    return;
  }
  if (!cards.length) {
    const message = document.createElement("p");
    message.className = "order-cards-status";
    message.textContent = "该订单暂无卡密。";
    container.append(message);
    return;
  }
  cards.forEach((card, index) => {
    const entry = document.createElement("p");
    entry.className = "order-card-code";
    entry.textContent = `卡密 ${index + 1}：${card}`;
    container.append(entry);
  });
}

async function showOrderCards(item, order, container) {
  if (container.dataset.loaded === "true") {
    container.hidden = false;
    item.setAttribute("aria-expanded", "true");
    return;
  }
  item.setAttribute("aria-busy", "true");
  renderOrderCards(container, [], "正在读取卡密...");
  container.hidden = false;
  item.setAttribute("aria-expanded", "true");
  const result = await sendOrderMessage({ type: "get-order-cards", tradeNo: order.trade_no, password: orderPassword });
  renderOrderCards(container, result.cards || [], result.error);
  container.dataset.loaded = "true";
  item.removeAttribute("aria-busy");
}

function renderOrderPagination(result) {
  const total = Number(result.total) || 0;
  const totalPages = Math.max(1, Math.ceil(total / ORDER_PAGE_SIZE));
  currentOrderPage = Math.min(Math.max(Number(result.current) || currentOrderPage, 1), totalPages);
  elements.orderPagination.hidden = totalPages <= 1;
  elements.orderPageInfo.textContent = `${currentOrderPage} / ${totalPages}`;
  elements.orderPreviousPage.disabled = currentOrderPage === 1;
  elements.orderNextPage.disabled = currentOrderPage === totalPages;
}

function renderOrders(result) {
  const orders = result.orders || [];
  elements.orderList.replaceChildren();
  elements.captchaPanel.hidden = true;
  elements.startCaptcha.hidden = true;
  elements.orderPagination.hidden = true;
  if (result.requiresVerification) {
    elements.orderContact.textContent = "请先在弹窗完成人机验证。";
    elements.ordersEmpty.textContent = "验证完成后将自动显示订单。";
    elements.ordersEmpty.hidden = false;
    elements.startCaptcha.hidden = false;
    return;
  }
  if (result.error) {
    elements.orderContact.textContent = "订单查询失败。";
    elements.ordersEmpty.textContent = result.error;
    elements.ordersEmpty.hidden = false;
    return;
  }
  elements.ordersEmpty.hidden = orders.length > 0;
  elements.ordersEmpty.textContent = "未查询到订单。";
  elements.orderContact.textContent = `联系方式：${orderContact} · 共 ${result.total || orders.length} 笔`;
  renderOrderPagination(result);
  orders.forEach((order) => {
    const item = document.createElement("article");
    item.className = "order-item";
    item.tabIndex = 0;
    item.setAttribute("role", "button");
    item.setAttribute("aria-expanded", "false");
    const heading = document.createElement("div");
    heading.className = "order-item-heading";
    const product = document.createElement("strong");
    product.textContent = order.goods_name || "未命名商品";
    product.title = product.textContent;
    const detailsButton = document.createElement("button");
    detailsButton.className = "order-detail-button";
    detailsButton.type = "button";
    detailsButton.title = "打开订单详情";
    detailsButton.setAttribute("aria-label", "打开订单详情");
    detailsButton.textContent = "↗";
    detailsButton.disabled = !order.trade_no;
    detailsButton.addEventListener("click", (event) => {
      event.stopPropagation();
      if (!order.trade_no) return;
      openOrderDetails(order.trade_no).catch(() => {});
    });
    heading.append(product, detailsButton);
    const meta = document.createElement("p");
    meta.textContent = `${orderStatus(order.status)} · ¥${order.total_amount || "0.00"} · ${formatOrderTime(order.create_time)}`;
    const number = document.createElement("p");
    number.className = "order-number";
    number.textContent = `订单号：${order.trade_no || "-"}`;
    const cards = document.createElement("div");
    cards.className = "order-cards";
    cards.hidden = true;
    const loadCards = () => showOrderCards(item, order, cards).catch((error) => {
      renderOrderCards(cards, [], error.message || "无法读取卡密");
      cards.hidden = false;
      item.removeAttribute("aria-busy");
    });
    item.addEventListener("click", loadCards);
    item.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        loadCards();
      }
    });
    item.append(heading, meta, number, cards);
    elements.orderList.append(item);
  });
}

async function sendOrderMessage(message) {
  if (!currentTabId) throw new Error("当前页面不可用");
  return chrome.tabs.sendMessage(currentTabId, message);
}

async function loadOrders(page = currentOrderPage) {
  currentOrderPage = Math.max(Number(page) || 1, 1);
  elements.orderPreviousPage.disabled = true;
  elements.orderNextPage.disabled = true;
  if (!orderContact) {
    renderOrders({ orders: [], total: 0, error: "请先在设置中填写联系方式。" });
    return;
  }
  renderOrders(await sendOrderMessage({
    type: "get-order-info",
    contact: orderContact,
    page: currentOrderPage,
    pageSize: ORDER_PAGE_SIZE
  }));
}

async function loadCaptcha() {
  elements.captchaPanel.hidden = false;
  elements.startCaptcha.hidden = true;
  elements.captchaStatus.textContent = "正在加载验证码...";
  elements.verifyCaptcha.disabled = true;
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
  elements.captchaStatus.textContent = "正在验证...";
  const result = await sendOrderMessage({ type: "verify-order-captcha", code });
  if (!result.verified) {
    elements.captchaStatus.textContent = result.error || "验证码不正确，请重试。";
    if (result.imageUrl) elements.captchaImage.src = result.imageUrl;
    elements.verifyCaptcha.disabled = false;
    elements.captchaCode.focus();
    return;
  }
  currentOrderPage = 1;
  await loadOrders();
}

async function showOrders() {
  elements.ordersPanel.hidden = false;
  elements.settings.hidden = true;
  elements.productsTab.setAttribute("aria-selected", "false");
  elements.ordersTab.setAttribute("aria-selected", "true");
  elements.popupTitle.textContent = "订单信息";
  await loadOrders();
}

function showOrdersError(error) {
  elements.orderContact.textContent = "无法读取订单信息。";
  elements.ordersEmpty.textContent = error?.message || "请刷新当前网页后重试。";
  elements.ordersEmpty.hidden = false;
  elements.startCaptcha.hidden = true;
  elements.captchaPanel.hidden = true;
  elements.orderPagination.hidden = true;
}

function showProducts() {
  elements.ordersPanel.hidden = true;
  elements.settings.hidden = false;
  elements.productsTab.setAttribute("aria-selected", "true");
  elements.ordersTab.setAttribute("aria-selected", "false");
  elements.popupTitle.textContent = "链动小铺助手";
}

async function initialize() {
  elements.hideSoldOutToggle.checked = await getFilterSetting();
  await loadOrderSettings();
  elements.orderContactInput.value = orderContact;
  elements.orderPasswordInput.value = orderPassword;
  const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  elements.pageTitle.textContent = currentTab?.title || "未命名页面";
  const supported = isWzypUrl(currentTab?.url || "");
  const orderPage = isOrderUrl(currentTab?.url || "");
  elements.unsupported.hidden = supported;
  elements.toolContent.hidden = !supported;
  if (!supported || !currentTab?.id) return;

  currentTabId = currentTab.id;

  if (orderPage) {
    try {
      await showOrders();
    } catch (error) {
      showOrdersError(error);
    }
    return;
  }
  showProducts();
}

elements.hideSoldOutToggle.addEventListener("change", () => {
  chrome.storage?.local?.set({ [FILTER_SETTING_KEY]: elements.hideSoldOutToggle.checked });
});
elements.orderSettingsForm.addEventListener("submit", (event) => {
  event.preventDefault();
  saveOrderSettings().catch((error) => { elements.orderSettingsStatus.textContent = error.message || "保存失败。"; });
});
elements.startCaptcha.addEventListener("click", () => loadCaptcha().catch((error) => { elements.captchaStatus.textContent = error.message || "无法加载验证码。"; }));
elements.refreshCaptcha.addEventListener("click", () => loadCaptcha().catch((error) => { elements.captchaStatus.textContent = error.message || "无法刷新验证码。"; }));
elements.verifyCaptcha.addEventListener("click", () => verifyCaptcha().catch((error) => { elements.captchaStatus.textContent = error.message || "验证失败。"; elements.verifyCaptcha.disabled = false; }));
elements.captchaCode.addEventListener("keydown", (event) => { if (event.key === "Enter") verifyCaptcha().catch(() => {}); });
elements.productsTab.addEventListener("click", showProducts);
elements.ordersTab.addEventListener("click", () => showOrders().catch(showOrdersError));
elements.orderPreviousPage.addEventListener("click", () => loadOrders(currentOrderPage - 1).catch(showOrdersError));
elements.orderNextPage.addEventListener("click", () => loadOrders(currentOrderPage + 1).catch(showOrdersError));

initialize();
