let selectedElement = null;
let originalState = null;
let hoveredElement = null;
const hiddenProducts = new Map();
let soldOutObserver = null;
let hideScheduled = false;
const HIGHLIGHT_CLASS = "wzyp-inspector-highlight";
const PICKER_STYLE_ID = "wzyp-inspector-style";
const SOLD_OUT_STYLE_ID = "wzyp-sold-out-filter";
const PRODUCT_IMAGE_STYLE_ID = "wzyp-product-image-filter";
const PRODUCT_LIST_LAYOUT_STYLE_ID = "wzyp-product-list-layout";
const PRODUCT_GRID_CLASS = "wzyp-product-grid";
const TARGET_SHOP_TOKEN = "2VWX76A4";
const TARGET_CARD_CATEGORY_ID = 67214;
const FILTER_SETTING_KEY = "hideSoldOutProducts";
const PRODUCT_SORT_SETTING_KEY = "productSortMode";
const ORDER_TICKET_STORAGE_KEY = "wzypOrderVerificationTicket";
const ORDER_CONTACT_SETTING_KEY = "orderContact";
const ORDER_PASSWORD_SETTING_KEY = "orderPassword";
const REMEMBER_ORDER_PASSWORD_SETTING_KEY = "rememberOrderPassword";
const unavailableGoodsKeys = new Set();
const unavailableGoodsNames = new Set();
const originalProductOrders = new Map();
let filterEnabled = true;
let productSortMode = "price-asc";
let orderCaptcha = null;
let orderTicket = null;
let orderTicketLoaded = false;
let orderAutofillObserver = null;
let orderAutofillScheduled = false;
let orderAutofillSettings = null;

function getMainContent() {
  return document.querySelector("main, article, [role='main']") || document.body;
}

function analyzePage() {
  const main = getMainContent();
  const text = (main.innerText || "").replace(/\s+/g, " ").trim();
  const headings = [...main.querySelectorAll("h1, h2, h3, h4, h5, h6")];
  const description = headings.slice(0, 3).map((heading) => heading.textContent.trim()).filter(Boolean).join(" / ");
  return { textLength: text.length, headings: headings.length, links: main.querySelectorAll("a[href]").length, images: main.querySelectorAll("img").length, outOfStock: findSoldOutProducts().length, hiddenOutOfStock: hiddenSoldOutCount(), description: description || text.slice(0, 110) };
}

function valueFromAccountObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const name = ["nickname", "nick_name", "username", "user_name", "account", "name", "email", "mobile", "phone"]
    .map((key) => value[key])
    .find((item) => typeof item === "string" && item.trim());
  if (!name) return null;
  const detail = ["email", "mobile", "phone", "username", "user_name", "account"]
    .map((key) => value[key])
    .find((item) => typeof item === "string" && item.trim() && item !== name);
  return { name: normalizeText(name), detail: detail ? normalizeText(detail) : "" };
}

function findAccountInStorage(storage) {
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key || !/(user|account|profile|auth|login|member)/i.test(key)) continue;
    try {
      const value = JSON.parse(storage.getItem(key));
      const directMatch = valueFromAccountObject(value);
      if (directMatch) return directMatch;
      if (value && typeof value === "object") {
        for (const nestedValue of Object.values(value)) {
          const nestedMatch = valueFromAccountObject(nestedValue);
          if (nestedMatch) return nestedMatch;
        }
      }
    } catch {
      // Non-JSON storage values cannot safely identify an account.
    }
  }
  return null;
}

function getAccountInfo() {
  const storedAccount = findAccountInStorage(window.localStorage) || findAccountInStorage(window.sessionStorage);
  if (storedAccount) return storedAccount;
  const visibleAccount = document.querySelector("[data-account], [data-username], .user-name, .username, .user_name, .account-name, .account_name");
  const name = normalizeText(visibleAccount?.textContent);
  return name ? { name, detail: "" } : { name: "未检测到登录账号", detail: "请先在当前网站登录。" };
}

async function getSavedOrderTicket() {
  if (orderTicketLoaded) return orderTicket;
  orderTicketLoaded = true;
  try {
    const response = await chrome.runtime.sendMessage({ type: "get-session-order-ticket" });
    if (response?.ticket) {
      orderTicket = response.ticket;
      return orderTicket;
    }
  } catch {
    // Fall through to migrate tickets saved by earlier extension versions.
  }
  const storage = chrome.storage?.local;
  if (!storage) return null;
  const saved = await storage.get({ [ORDER_TICKET_STORAGE_KEY]: "" });
  orderTicket = typeof saved[ORDER_TICKET_STORAGE_KEY] === "string" && saved[ORDER_TICKET_STORAGE_KEY]
    ? saved[ORDER_TICKET_STORAGE_KEY]
    : null;
  if (orderTicket) {
    const migrated = await chrome.runtime.sendMessage({ type: "set-session-order-ticket", ticket: orderTicket }).catch(() => null);
    if (migrated?.saved) await storage.remove(ORDER_TICKET_STORAGE_KEY).catch(() => {});
  }
  return orderTicket;
}

async function saveOrderTicket(ticket) {
  orderTicket = ticket;
  orderTicketLoaded = true;
  try {
    await chrome.runtime.sendMessage({ type: "set-session-order-ticket", ticket });
  } catch {
    // The ticket remains usable for this page when session storage is unavailable.
  }
}

async function clearSavedOrderTicket() {
  orderTicket = null;
  orderTicketLoaded = true;
  await chrome.runtime.sendMessage({ type: "clear-session-order-ticket" }).catch(() => {});
  await chrome.storage?.local?.remove(ORDER_TICKET_STORAGE_KEY).catch(() => {});
}

function isVerificationFailure(message) {
  return /人机|验证码|验证失败|ticket|captcha/i.test(message || "");
}

async function getOrderAutofillSettings() {
  if (orderAutofillSettings) return orderAutofillSettings;
  const storage = chrome.storage?.local;
  const saved = storage ? await storage.get([
    ORDER_CONTACT_SETTING_KEY,
    ORDER_PASSWORD_SETTING_KEY,
    REMEMBER_ORDER_PASSWORD_SETTING_KEY
  ]) : {};
  const rememberPassword = typeof saved[REMEMBER_ORDER_PASSWORD_SETTING_KEY] === "boolean"
    ? saved[REMEMBER_ORDER_PASSWORD_SETTING_KEY]
    : Boolean(saved[ORDER_PASSWORD_SETTING_KEY]);
  let password = rememberPassword && typeof saved[ORDER_PASSWORD_SETTING_KEY] === "string"
    ? saved[ORDER_PASSWORD_SETTING_KEY]
    : "";
  if (!password) {
    try {
      const response = await chrome.runtime.sendMessage({ type: "get-session-order-password" });
      password = typeof response?.password === "string" ? response.password : "";
    } catch {
      password = "";
    }
  }
  orderAutofillSettings = {
    contact: typeof saved[ORDER_CONTACT_SETTING_KEY] === "string" && saved[ORDER_CONTACT_SETTING_KEY].trim()
      ? saved[ORDER_CONTACT_SETTING_KEY].trim()
      : "",
    password
  };
  return orderAutofillSettings;
}

function isVisible(element) {
  const style = window.getComputedStyle(element);
  const bounds = element.getBoundingClientRect();
  return style.display !== "none" && style.visibility !== "hidden" && bounds.width > 0 && bounds.height > 0;
}

function orderConfirmationDialogs() {
  return [...document.querySelectorAll("[role='dialog'], .arco-modal, .arco-modal-container")]
    .filter((dialog) => isVisible(dialog) && normalizeText(dialog.textContent).includes("订单确认"));
}

function orderInput(scope, term) {
  return [...scope.querySelectorAll("input:not([type='hidden'])")].find((input) => {
    const attributes = [input.placeholder, input.name, input.id, input.className]
      .filter((value) => typeof value === "string")
      .join(" ");
    return attributes.includes(term);
  });
}

function setOrderInputValue(input, value) {
  if (!input || input.value || !value) return;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

async function autofillOrderConfirmation() {
  const dialogs = orderConfirmationDialogs();
  if (!dialogs.length) return;
  const settings = await getOrderAutofillSettings();
  dialogs.forEach((dialog) => {
    setOrderInputValue(orderInput(dialog, "联系方式"), settings.contact);
    setOrderInputValue(orderInput(dialog, "安全密码"), settings.password);
  });
}

function scheduleOrderConfirmationAutofill() {
  if (orderAutofillScheduled) return;
  orderAutofillScheduled = true;
  requestAnimationFrame(() => {
    orderAutofillScheduled = false;
    autofillOrderConfirmation().catch(() => {
      // Autofill should not affect the store page when its dialog structure changes.
    });
  });
}

function startOrderConfirmationAutofill() {
  orderAutofillObserver?.disconnect();
  orderAutofillObserver = new MutationObserver(scheduleOrderConfirmationAutofill);
  orderAutofillObserver.observe(document.body, { childList: true, subtree: true });
  scheduleOrderConfirmationAutofill();
}

async function getOrderInfo(contact, page = 1, pageSize = 10) {
  const current = Number.isInteger(page) && page > 0 ? page : 1;
  const size = Number.isInteger(pageSize) && pageSize > 0 && pageSize <= 100 ? pageSize : 10;
  const savedTicket = await getSavedOrderTicket();
  const ticket = savedTicket || new URLSearchParams(window.location.search).get("ticket");
  if (!ticket) return { orders: [], total: 0, requiresVerification: true };
  const response = await fetch("/shopApi/Order/list", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ current, pageSize: size, keywords: contact, ticket })
  });
  if (!response.ok) {
    if (savedTicket && [401, 403].includes(response.status)) {
      await clearSavedOrderTicket();
      return { orders: [], total: 0, requiresVerification: true };
    }
    throw new Error("订单请求失败");
  }
  const payload = await response.json();
  if (payload.code !== 1) {
    if (savedTicket && isVerificationFailure(payload.msg)) {
      await clearSavedOrderTicket();
      return { orders: [], total: 0, requiresVerification: true };
    }
    throw new Error(payload.msg || "订单请求失败");
  }
  return {
    orders: Array.isArray(payload.data?.list) ? payload.data.list : [],
    total: Number(payload.data?.total) || 0,
    current,
    pageSize: size
  };
}

async function getOrderCards(tradeNo, password) {
  if (!/^[A-Za-z0-9_-]+$/.test(tradeNo || "")) throw new Error("订单号无效");
  const queryPassword = typeof password === "string" ? password : "";
  const response = await fetch("/shopApi/Order/info", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ trade_no: tradeNo, query_password: queryPassword, dump: 1 })
  });
  if (!response.ok) throw new Error("订单详情请求失败");
  const payload = await response.json();
  if (payload.code !== 1) throw new Error(payload.msg || "无法读取订单详情");
  if (payload.data?.status !== 1) throw new Error("订单尚未完成，暂时没有可查看的卡密");
  const cards = payload.data?.response?.cards;
  if (!Array.isArray(cards)) return { cards: [] };
  return { cards: cards.filter((card) => typeof card === "string" && card.trim()) };
}

function md5(value) {
  const bytes = [...new TextEncoder().encode(value)];
  const originalLength = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  for (let index = 0; index < 8; index += 1) bytes.push(index < 4 ? (originalLength >>> (index * 8)) & 0xff : 0);
  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;
  const shifts = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
  const constants = Array.from({ length: 64 }, (_value, index) => Math.floor(Math.abs(Math.sin(index + 1)) * 0x100000000) >>> 0);
  const rotateLeft = (number, amount) => (number << amount) | (number >>> (32 - amount));
  for (let offset = 0; offset < bytes.length; offset += 64) {
    const words = Array.from({ length: 16 }, (_value, index) => bytes[offset + index * 4] | (bytes[offset + index * 4 + 1] << 8) | (bytes[offset + index * 4 + 2] << 16) | (bytes[offset + index * 4 + 3] << 24));
    let a = a0; let b = b0; let c = c0; let d = d0;
    for (let index = 0; index < 64; index += 1) {
      let f; let g;
      if (index < 16) { f = (b & c) | (~b & d); g = index; }
      else if (index < 32) { f = (d & b) | (~d & c); g = (5 * index + 1) % 16; }
      else if (index < 48) { f = b ^ c ^ d; g = (3 * index + 5) % 16; }
      else { f = c ^ (b | ~d); g = (7 * index) % 16; }
      const shift = shifts[(Math.floor(index / 16) * 4) + (index % 4)];
      const next = (b + rotateLeft((a + f + constants[index] + words[g]) | 0, shift)) | 0;
      a = d; d = c; c = b; b = next;
    }
    a0 = (a0 + a) | 0; b0 = (b0 + b) | 0; c0 = (c0 + c) | 0; d0 = (d0 + d) | 0;
  }
  return [a0, b0, c0, d0].map((word) => [0, 8, 16, 24].map((shift) => ((word >>> shift) & 0xff).toString(16).padStart(2, "0")).join("")).join("");
}

async function startOrderCaptcha() {
  const response = await fetch("/shopApi/Common/captchaStart", { method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ code: "" }) });
  const payload = await response.json();
  if (payload.code !== 1 || !payload.data?.img_url || !payload.data?.check_url || !payload.data?.ip) throw new Error(payload.msg || "无法加载验证码");
  orderCaptcha = { checkUrl: new URL(payload.data.check_url, window.location.origin).href, ip: payload.data.ip };
  return { imageUrl: new URL(payload.data.img_url, window.location.origin).href };
}

async function verifyOrderCaptcha(code) {
  if (!orderCaptcha) return { verified: false, error: "请先获取验证码。" };
  const sign = md5(`${md5(`${code}${orderCaptcha.ip}`)}JING`);
  const response = await fetch(orderCaptcha.checkUrl, { method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ code, sign }) });
  const payload = await response.json();
  if (payload.code === 1 && payload.data?.ticket) {
    await saveOrderTicket(payload.data.ticket);
    return { verified: true };
  }
  const nextCaptcha = await startOrderCaptcha();
  return { verified: false, error: payload.msg || "验证码不正确。", imageUrl: nextCaptcha.imageUrl };
}

function hiddenSoldOutCount() {
  let count = 0;
  hiddenProducts.forEach((_style, product) => {
    if (product.isConnected) count += 1;
    else hiddenProducts.delete(product);
  });
  return count;
}

function isSoldOutBadge(element) {
  const text = (element.textContent || "").replace(/\s+/g, "").trim();
  return element.matches(".stock.rank0") || /缺货|售罄|无货|已下架/.test(text);
}

function getProductContainer(badge) {
  const namedContainer = badge.closest(".goods_item, .goods-item, [class*='goods-item'], .goods_card, .goods-card, .list-item, .list_item");
  if (namedContainer) return namedContainer;
  let current = badge.parentElement;
  while (current && current !== document.body) {
    if (current.querySelector("a[href*='/item/']") && current.querySelectorAll(".stock, [class*='stock']").length === 1) return current;
    current = current.parentElement;
  }
  return null;
}

function normalizeText(value) {
  return (value || "").replace(/\s+/g, " ").trim();
}

function hideProduct(product) {
  if (!product || hiddenProducts.has(product)) return;
  hiddenProducts.set(product, { value: product.style.getPropertyValue("display"), priority: product.style.getPropertyPriority("display") });
  product.style.setProperty("display", "none", "important");
}

function getProductPrice(product) {
  const priceText = normalizeText(product.querySelector(".nowPrice")?.textContent);
  const price = Number.parseFloat(priceText.replace(/[^\d.]/g, ""));
  return Number.isFinite(price) ? price : Number.POSITIVE_INFINITY;
}

function getProductCards() {
  return document.querySelectorAll(".goods_item, .goods-item");
}

function isTargetShopPage() {
  return window.location.pathname === `/shop/${TARGET_SHOP_TOKEN}`;
}

function applyProductSort() {
  const groups = new Map();
  getProductCards().forEach((product) => {
    const parent = product.parentElement;
    if (!parent) return;
    const cards = groups.get(parent) || [];
    cards.push(product);
    groups.set(parent, cards);
  });
  groups.forEach((cards, parent) => {
    if (cards.length < 2) return;
    parent.classList.add(PRODUCT_GRID_CLASS);
    const originalOrder = originalProductOrders.get(parent) || [];
    cards.forEach((card) => {
      if (!originalOrder.includes(card)) originalOrder.push(card);
    });
    originalProductOrders.set(parent, originalOrder.filter((card) => card.isConnected));
    const originalIndexes = new Map(originalOrder.map((card, index) => [card, index]));
    const comparePrice = (first, second) => {
      const firstPrice = getProductPrice(first);
      const secondPrice = getProductPrice(second);
      if (!Number.isFinite(firstPrice)) return Number.isFinite(secondPrice) ? 1 : 0;
      if (!Number.isFinite(secondPrice)) return -1;
      const difference = productSortMode === "price-desc" ? secondPrice - firstPrice : firstPrice - secondPrice;
      return difference || (originalIndexes.get(first) ?? 0) - (originalIndexes.get(second) ?? 0);
    };
    const sorted = productSortMode === "default"
      ? [...cards].sort((first, second) => (originalIndexes.get(first) ?? 0) - (originalIndexes.get(second) ?? 0))
      : [...cards].sort(comparePrice);
    if (!sorted.some((card, index) => card !== cards[index])) return;
    sorted.forEach((card) => parent.append(card));
  });
}

function productState() {
  return {
    supported: isTargetShopPage(),
    hidden: hiddenSoldOutCount(),
    total: getProductCards().length,
    filterEnabled,
    sortMode: productSortMode
  };
}

function findSoldOutProducts() {
  const containers = new Set();
  document.querySelectorAll(".stock.rank0, .stock, [class*='stock'], span, div, p, em, i, b").forEach((badge) => {
    if (isSoldOutBadge(badge)) {
      const container = getProductContainer(badge);
      if (container) containers.add(container);
    }
  });
  return [...containers];
}

function findProductByGoodsKey(goodsKey) {
  const link = [...document.querySelectorAll("a[href]")].find((anchor) => {
    try {
      return new URL(anchor.href, window.location.origin).pathname === `/item/${goodsKey}`;
    } catch { return false; }
  });
  return link ? getProductContainer(link) : null;
}

function hideUnavailableGoodsByApi() {
  unavailableGoodsKeys.forEach((goodsKey) => {
    hideProduct(findProductByGoodsKey(goodsKey));
  });
  getProductCards().forEach((product) => {
    const productName = normalizeText(product.querySelector(".name")?.textContent);
    if (unavailableGoodsNames.has(productName)) hideProduct(product);
  });
}

async function loadTargetShopInventory() {
  const response = await fetch("/shopApi/Shop/goodsList", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "omit",
    body: JSON.stringify({ token: TARGET_SHOP_TOKEN, keywords: "", category_id: TARGET_CARD_CATEGORY_ID, goods_type: "card", current: 1, pageSize: 100 })
  });
  if (!response.ok) throw new Error("Inventory request failed");
  const payload = await response.json();
  if (payload.code !== 1 || !Array.isArray(payload.data?.list)) throw new Error("Unexpected inventory response");
  payload.data.list.forEach((goods) => {
    if (goods.extend?.stock_count === 0) {
      if (goods.goods_key) unavailableGoodsKeys.add(goods.goods_key);
      if (goods.name) unavailableGoodsNames.add(normalizeText(goods.name));
    }
  });
  if (filterEnabled) hideUnavailableGoodsByApi();
  applyProductSort();
}

function hideSoldOutProducts() {
  findSoldOutProducts().forEach((product) => {
    hideProduct(product);
  });
  return hiddenSoldOutCount();
}

function startProductObserver() {
  soldOutObserver?.disconnect();
  soldOutObserver = new MutationObserver(() => {
    if (hideScheduled) return;
    hideScheduled = true;
    requestAnimationFrame(() => {
      hideScheduled = false;
      if (filterEnabled) {
        hideSoldOutProducts();
        hideUnavailableGoodsByApi();
      }
      applyProductSort();
    });
  });
  soldOutObserver.observe(document.body, { childList: true, characterData: true, subtree: true });
}

function restoreSoldOutProducts() {
  document.querySelector(`#${SOLD_OUT_STYLE_ID}`)?.remove();
  let restored = 0;
  hiddenProducts.forEach((style, product) => {
    if (!product.isConnected) return;
    product.style.setProperty("display", style.value, style.priority);
    if (!style.value) product.style.removeProperty("display");
    restored += 1;
  });
  hiddenProducts.clear();
  return restored;
}

function enableSoldOutStyleFilter() {
  if (document.querySelector(`#${SOLD_OUT_STYLE_ID}`)) return;
  const style = document.createElement("style");
  style.id = SOLD_OUT_STYLE_ID;
  style.textContent = ".goods_item:has(.stock.rank0), .goods-item:has(.stock.rank0) { display: none !important; }";
  document.head.append(style);
}

function enableTargetShopImageFilter() {
  if (window.location.pathname !== "/shop/2VWX76A4" || document.querySelector(`#${PRODUCT_IMAGE_STYLE_ID}`)) return;
  const style = document.createElement("style");
  style.id = PRODUCT_IMAGE_STYLE_ID;
  style.textContent = ".goods_item .image, .goods_item .goods-item-img, .goods-item .image, .goods-item .goods-item-img { display: none !important; }";
  document.head.append(style);
}

function enableTargetShopProductLayout() {
  if (window.location.pathname !== "/shop/2VWX76A4" || document.querySelector(`#${PRODUCT_LIST_LAYOUT_STYLE_ID}`)) return;
  const style = document.createElement("style");
  style.id = PRODUCT_LIST_LAYOUT_STYLE_ID;
  style.textContent = `
    .${PRODUCT_GRID_CLASS} {
      align-items: start !important;
      display: grid !important;
      gap: 14px !important;
      grid-auto-flow: row !important;
      grid-template-columns: repeat(auto-fill, minmax(188px, 1fr)) !important;
    }
    .${PRODUCT_GRID_CLASS} > .goods_item,
    .${PRODUCT_GRID_CLASS} > .goods-item {
      float: none !important;
      height: auto !important;
      inset: auto !important;
      margin: 0 !important;
      min-width: 0 !important;
      position: relative !important;
      transform: none !important;
      width: auto !important;
    }
    @media (max-width: 640px) {
      .${PRODUCT_GRID_CLASS} { grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)) !important; }
    }
    @media (max-width: 420px) {
      .${PRODUCT_GRID_CLASS} { grid-template-columns: minmax(0, 1fr) !important; }
    }
  `;
  document.head.append(style);
}

function selectionDetails() {
  if (!selectedElement?.isConnected) return null;
  const match = window.getComputedStyle(selectedElement).backgroundColor.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
  const backgroundColor = match ? `#${match.slice(1).map((part) => Number(part).toString(16).padStart(2, "0")).join("")}` : "#ffffff";
  return { tagName: selectedElement.tagName, id: selectedElement.id, text: selectedElement.textContent.trim(), backgroundColor };
}

function ensurePickerStyle() {
  if (document.querySelector(`#${PICKER_STYLE_ID}`)) return;
  const style = document.createElement("style");
  style.id = PICKER_STYLE_ID;
  style.textContent = `.${HIGHLIGHT_CLASS} { outline: 3px solid #e65f2b !important; outline-offset: 2px !important; cursor: crosshair !important; }`;
  document.head.append(style);
}

function clearHover() { hoveredElement?.classList.remove(HIGHLIGHT_CLASS); hoveredElement = null; }
function stopPicker() {
  clearHover();
  document.removeEventListener("pointermove", onPointerMove, true);
  document.removeEventListener("click", onPickerClick, true);
  document.removeEventListener("keydown", onPickerKeydown, true);
}
function onPointerMove(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement) || target === document.body || target === document.documentElement || target === hoveredElement) return;
  clearHover();
  hoveredElement = target;
  hoveredElement.classList.add(HIGHLIGHT_CLASS);
}
function onPickerClick(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  event.preventDefault();
  event.stopPropagation();
  selectedElement = target;
  originalState = { text: selectedElement.textContent, backgroundColor: selectedElement.style.backgroundColor };
  stopPicker();
}
function onPickerKeydown(event) { if (event.key === "Escape") stopPicker(); }
function startPicker() {
  stopPicker(); ensurePickerStyle();
  document.addEventListener("pointermove", onPointerMove, true);
  document.addEventListener("click", onPickerClick, true);
  document.addEventListener("keydown", onPickerKeydown, true);
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "analyze-page") sendResponse(analyzePage());
  if (message.type === "get-account-info") sendResponse(getAccountInfo());
  if (message.type === "get-order-info") {
    getOrderInfo(message.contact, message.page, message.pageSize).then(sendResponse).catch((error) => sendResponse({ orders: [], total: 0, error: error.message }));
    return true;
  }
  if (message.type === "get-order-cards") {
    getOrderCards(message.tradeNo, message.password).then(sendResponse).catch((error) => sendResponse({ cards: [], error: error.message }));
    return true;
  }
  if (message.type === "start-order-captcha") {
    startOrderCaptcha().then(sendResponse).catch((error) => sendResponse({ error: error.message }));
    return true;
  }
  if (message.type === "verify-order-captcha") {
    verifyOrderCaptcha(message.code).then(sendResponse).catch((error) => sendResponse({ verified: false, error: error.message }));
    return true;
  }
  if (message.type === "refresh-order-autofill") {
    orderAutofillSettings = null;
    scheduleOrderConfirmationAutofill();
    sendResponse({ refreshed: true });
  }
  if (message.type === "get-product-state") sendResponse(productState());
  if (message.type === "set-product-filter") {
    if (!isTargetShopPage()) { sendResponse(productState()); return; }
    filterEnabled = Boolean(message.enabled);
    if (filterEnabled) {
      enableSoldOutStyleFilter();
      hideSoldOutProducts();
      hideUnavailableGoodsByApi();
    } else {
      restoreSoldOutProducts();
    }
    applyProductSort();
    startProductObserver();
    sendResponse(productState());
  }
  if (message.type === "set-product-sort") {
    if (!isTargetShopPage()) { sendResponse(productState()); return; }
    productSortMode = ["default", "price-asc", "price-desc"].includes(message.mode) ? message.mode : "price-asc";
    applyProductSort();
    sendResponse(productState());
  }
  if (message.type === "start-picker") { startPicker(); sendResponse({ started: true }); }
  if (message.type === "get-selected-element") sendResponse(selectionDetails());
  if (message.type === "hide-sold-out-products") {
    enableSoldOutStyleFilter();
    const hidden = hideSoldOutProducts();
    startProductObserver();
    sendResponse({ hidden });
  }
  if (message.type === "restore-sold-out-products") sendResponse({ restored: restoreSoldOutProducts() });
  if (message.type === "update-selected-element") {
    if (!selectedElement?.isConnected) sendResponse({ error: "请重新选择页面元素。" });
    else { selectedElement.textContent = message.text; selectedElement.style.backgroundColor = message.backgroundColor; sendResponse({ updated: true }); }
  }
  if (message.type === "restore-selected-element") {
    if (!selectedElement?.isConnected || !originalState) sendResponse(null);
    else { selectedElement.textContent = originalState.text; selectedElement.style.backgroundColor = originalState.backgroundColor; sendResponse(selectionDetails()); }
  }
});

function enableTargetShopFilter() {
  if (!isTargetShopPage()) return;
  enableTargetShopProductLayout();
  if (filterEnabled) {
    enableSoldOutStyleFilter();
    hideSoldOutProducts();
  }
  applyProductSort();
  startProductObserver();
  loadTargetShopInventory().catch(() => {
    // The DOM-based filter continues to work if the inventory endpoint is unavailable.
  });
}

async function initializeTargetShopFilter() {
  enableTargetShopImageFilter();
  enableTargetShopProductLayout();
  const storage = chrome.storage?.local;
  if (storage) {
    const settings = await storage.get({
      [FILTER_SETTING_KEY]: true,
      [PRODUCT_SORT_SETTING_KEY]: "price-asc"
    });
    filterEnabled = settings[FILTER_SETTING_KEY];
    productSortMode = ["default", "price-asc", "price-desc"].includes(settings[PRODUCT_SORT_SETTING_KEY])
      ? settings[PRODUCT_SORT_SETTING_KEY]
      : "price-asc";
  }
  if (isTargetShopPage()) {
    applyProductSort();
    startProductObserver();
  }
  enableTargetShopFilter();
  startOrderConfirmationAutofill();
}

chrome.storage?.onChanged?.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  if (changes[FILTER_SETTING_KEY]) {
    filterEnabled = changes[FILTER_SETTING_KEY].newValue;
    if (isTargetShopPage()) {
      if (filterEnabled) enableTargetShopFilter();
      else restoreSoldOutProducts();
    }
  }
  if (changes[PRODUCT_SORT_SETTING_KEY]) {
    productSortMode = ["default", "price-asc", "price-desc"].includes(changes[PRODUCT_SORT_SETTING_KEY].newValue)
      ? changes[PRODUCT_SORT_SETTING_KEY].newValue
      : "price-asc";
    if (isTargetShopPage()) applyProductSort();
  }
  if (changes[ORDER_CONTACT_SETTING_KEY] || changes[ORDER_PASSWORD_SETTING_KEY] || changes[REMEMBER_ORDER_PASSWORD_SETTING_KEY]) {
    orderAutofillSettings = null;
    scheduleOrderConfirmationAutofill();
  }
});

initializeTargetShopFilter();
