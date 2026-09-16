const TARGET_SHOP_TOKEN = "2VWX76A4";
const FILTER_KEY = "hideSoldOutProducts";
const SORT_KEY = "productSortMode";
const PRODUCT_LAYOUT_STYLE_ID = "wzyp-product-list-layout";
const PRODUCT_GRID_CLASS = "wzyp-product-grid";
const PRODUCT_GRID_SHELL_CLASS = "wzyp-product-grid-shell";
const hidden = new Map();
const originalOrders = new WeakMap();
let filterEnabled = true;
let sortMode = "price-asc";
let captcha = null;
let autofillCache = null;

const normalize = (value) => (value || "").replace(/\s+/g, " ").trim();
const sessionMessage = (type, action, value) => chrome.runtime.sendMessage({ type, action, value });
const shopPage = () => /^\/shop\/[^/]+\/?$/.test(location.pathname);
const targetShop = () => location.pathname === `/shop/${TARGET_SHOP_TOKEN}`;
const productCards = () => [...document.querySelectorAll(".goods_item, .goods-item")];
const soldOut = (card) => /缺货|售罄|无货|已下架/.test(normalize(card.textContent)) || Boolean(card.querySelector(".stock.rank0"));
const productPrice = (card) => { const value = Number.parseFloat(normalize(card.querySelector(".nowPrice")?.textContent).replace(/[^\d.]/g, "")); return Number.isFinite(value) ? value : Infinity; };

function hideCard(card) { if (!card || hidden.has(card)) return; hidden.set(card, { value: card.style.getPropertyValue("display"), priority: card.style.getPropertyPriority("display") }); card.style.setProperty("display", "none", "important"); }
function restoreCards() { hidden.forEach((style, card) => { if (!card.isConnected) return; card.style.setProperty("display", style.value, style.priority); if (!style.value) card.style.removeProperty("display"); }); hidden.clear(); }
function enableProductLayout() {
  if (!shopPage() || document.getElementById(PRODUCT_LAYOUT_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = PRODUCT_LAYOUT_STYLE_ID;
  style.textContent = `
    .${PRODUCT_GRID_SHELL_CLASS} {
      margin-inline: 0 !important;
      max-width: 100% !important;
      width: 100% !important;
    }
    .${PRODUCT_GRID_CLASS} {
      align-items: stretch !important;
      box-sizing: border-box !important;
      display: grid !important;
      gap: 8px !important;
      grid-auto-flow: row !important;
      grid-template-columns: repeat(auto-fill, 212px) !important;
      height: auto !important;
      justify-content: space-between !important;
      margin: 0 !important;
      max-width: 100% !important;
      width: 100% !important;
    }
    .${PRODUCT_GRID_CLASS} > .goods_item,
    .${PRODUCT_GRID_CLASS} > .goods-item {
      display: flex !important;
      flex: 0 0 212px !important;
      float: none !important;
      height: 148px !important;
      inset: auto !important;
      margin: 0 !important;
      max-width: 212px !important;
      min-width: 212px !important;
      overflow: hidden !important;
      position: relative !important;
      transform: none !important;
      width: 212px !important;
    }
    .${PRODUCT_GRID_CLASS} > .goods_item .image,
    .${PRODUCT_GRID_CLASS} > .goods_item .goods-item-img,
    .${PRODUCT_GRID_CLASS} > .goods-item .image,
    .${PRODUCT_GRID_CLASS} > .goods-item .goods-item-img {
      display: none !important;
    }
    .${PRODUCT_GRID_CLASS} > .goods_item .info,
    .${PRODUCT_GRID_CLASS} > .goods-item .info {
      display: flex !important;
      flex: 1 1 auto !important;
      flex-direction: column !important;
      min-width: 0 !important;
    }
    .${PRODUCT_GRID_CLASS} > .goods_item .name,
    .${PRODUCT_GRID_CLASS} > .goods-item .name {
      -webkit-box-orient: vertical !important;
      -webkit-line-clamp: 4 !important;
      display: -webkit-box !important;
      overflow: hidden !important;
      overflow-wrap: anywhere !important;
      text-overflow: clip !important;
      white-space: normal !important;
    }
    .${PRODUCT_GRID_CLASS} > .goods_item .subinfo,
    .${PRODUCT_GRID_CLASS} > .goods-item .subinfo {
      margin-top: auto !important;
    }
    @media (max-width: 40rem) {
      .${PRODUCT_GRID_CLASS} {
        grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
      }
      .${PRODUCT_GRID_CLASS} > .goods_item,
      .${PRODUCT_GRID_CLASS} > .goods-item {
        flex-basis: auto !important;
        max-width: none !important;
        min-width: 0 !important;
        width: auto !important;
      }
    }
  `;
  document.head.append(style);
}
function applyProducts() {
  if (!shopPage()) return;
  enableProductLayout();
  const groups = new Map(); productCards().forEach((card) => { const cards = groups.get(card.parentElement) || []; cards.push(card); groups.set(card.parentElement, cards); });
  groups.forEach((_cards, parent) => { parent.classList.add(PRODUCT_GRID_CLASS); parent.closest(".goods_box")?.classList.add(PRODUCT_GRID_SHELL_CLASS); });
  if (!targetShop()) return;
  if (filterEnabled) productCards().filter(soldOut).forEach(hideCard); else restoreCards();
  groups.forEach((cards, parent) => { if (cards.length < 2) return; const saved = originalOrders.get(parent) || []; cards.forEach((card) => { if (!saved.includes(card)) saved.push(card); }); originalOrders.set(parent, saved); const index = new Map(saved.map((card, position) => [card, position])); const ordered = sortMode === "default" ? [...cards].sort((a, b) => index.get(a) - index.get(b)) : [...cards].sort((a, b) => (sortMode === "price-desc" ? productPrice(b) - productPrice(a) : productPrice(a) - productPrice(b)) || index.get(a) - index.get(b)); if (ordered.some((card, position) => card !== cards[position])) ordered.forEach((card) => parent.append(card)); });
}
function productState() { return { supported: targetShop(), total: productCards().length, hidden: [...hidden].filter(([card]) => card.isConnected).length, filterEnabled, sortMode }; }

async function autofillSettings() {
  if (autofillCache) return autofillCache;
  const saved = await chrome.storage.local.get({ orderContact: "", orderPassword: "", rememberOrderPassword: false });
  const session = await sessionMessage("session-password", "get").catch(() => ({}));
  autofillCache = { contact: saved.orderContact.trim(), password: saved.rememberOrderPassword ? saved.orderPassword : (session.value || "") };
  return autofillCache;
}
function setInput(input, value) { if (!input || input.value || !value) return; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); input.dispatchEvent(new Event("change", { bubbles: true })); }
async function autofill() { const settings = await autofillSettings(); document.querySelectorAll("[role='dialog'], .arco-modal, .arco-modal-container").forEach((dialog) => { if (!normalize(dialog.textContent).includes("订单确认")) return; [...dialog.querySelectorAll("input:not([type='hidden'])")].forEach((input) => { const key = `${input.placeholder} ${input.name} ${input.id} ${input.className}`; if (key.includes("联系方式")) setInput(input, settings.contact); if (key.includes("安全密码")) setInput(input, settings.password); }); }); }

async function ticket() { const response = await sessionMessage("session-ticket", "get"); return response.value || new URLSearchParams(location.search).get("ticket") || ""; }
async function orders(contact, page, pageSize) { const savedTicket = await ticket(); if (!savedTicket) return { orders: [], total: 0, requiresVerification: true }; const response = await fetch("/shopApi/Order/list", { method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ current: page, pageSize, keywords: contact, ticket: savedTicket }) }); const payload = await response.json(); if (!response.ok || payload.code !== 1) { if (/人机|验证码|ticket|captcha/i.test(payload.msg || "")) { await sessionMessage("session-ticket", "clear"); return { orders: [], total: 0, requiresVerification: true }; } throw new Error(payload.msg || "订单请求失败"); } return { orders: Array.isArray(payload.data?.list) ? payload.data.list : [], total: Number(payload.data?.total) || 0 }; }
async function cards(tradeNo, password) { if (!/^[A-Za-z0-9_-]+$/.test(tradeNo || "")) throw new Error("订单号无效"); const response = await fetch("/shopApi/Order/info", { method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ trade_no: tradeNo, query_password: password || "", dump: 1 }) }); const payload = await response.json(); if (!response.ok || payload.code !== 1) throw new Error(payload.msg || "无法读取订单详情"); if (payload.data?.status !== 1) throw new Error("订单尚未完成，暂时没有可查看的卡密"); return { cards: (payload.data?.response?.cards || []).filter((value) => typeof value === "string" && value.trim()) }; }

function md5(value) { const bytes = [...new TextEncoder().encode(value)], length = bytes.length * 8; bytes.push(128); while (bytes.length % 64 !== 56) bytes.push(0); for (let i = 0; i < 8; i += 1) bytes.push(i < 4 ? (length >>> (i * 8)) & 255 : 0); let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476; const shifts = [7,12,17,22,5,9,14,20,4,11,16,23,6,10,15,21], constants = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000) >>> 0), rot = (n, i) => (n << i) | (n >>> (32 - i)); for (let offset = 0; offset < bytes.length; offset += 64) { const words = Array.from({ length: 16 }, (_, i) => bytes[offset + i * 4] | (bytes[offset + i * 4 + 1] << 8) | (bytes[offset + i * 4 + 2] << 16) | (bytes[offset + i * 4 + 3] << 24)); let [a,b,c,d] = [a0,b0,c0,d0]; for (let i = 0; i < 64; i += 1) { let f, g; if (i < 16) { f = (b & c) | (~b & d); g = i; } else if (i < 32) { f = (d & b) | (~d & c); g = (5 * i + 1) % 16; } else if (i < 48) { f = b ^ c ^ d; g = (3 * i + 5) % 16; } else { f = c ^ (b | ~d); g = (7 * i) % 16; } const next = (b + rot((a + f + constants[i] + words[g]) | 0, shifts[Math.floor(i / 16) * 4 + i % 4])) | 0; [a,b,c,d] = [d,next,b,c]; } [a0,b0,c0,d0] = [(a0+a)|0,(b0+b)|0,(c0+c)|0,(d0+d)|0]; } return [a0,b0,c0,d0].map((word) => [0,8,16,24].map((shift) => ((word >>> shift) & 255).toString(16).padStart(2,"0")).join("")).join(""); }
async function startCaptcha() { const response = await fetch("/shopApi/Common/captchaStart", { method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ code: "" }) }); const payload = await response.json(); if (payload.code !== 1 || !payload.data?.img_url || !payload.data?.check_url || !payload.data?.ip) throw new Error(payload.msg || "无法加载验证码"); captcha = { checkUrl: new URL(payload.data.check_url, location.origin).href, ip: payload.data.ip }; return { imageUrl: new URL(payload.data.img_url, location.origin).href }; }
async function verifyCaptcha(code) { if (!captcha) return { verified: false, error: "请先获取验证码。" }; const sign = md5(`${md5(`${code}${captcha.ip}`)}JING`); const response = await fetch(captcha.checkUrl, { method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ code, sign }) }); const payload = await response.json(); if (payload.code === 1 && payload.data?.ticket) { await sessionMessage("session-ticket", "set", payload.data.ticket); return { verified: true }; } const next = await startCaptcha(); return { verified: false, error: payload.msg || "验证码不正确。", imageUrl: next.imageUrl }; }

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const reply = (task) => Promise.resolve(task).then(sendResponse).catch((error) => sendResponse({ error: error.message }));
  if (message.type === "get-product-state") sendResponse(productState());
  if (message.type === "set-product-filter") { filterEnabled = Boolean(message.enabled); chrome.storage.local.set({ [FILTER_KEY]: filterEnabled }); applyProducts(); sendResponse(productState()); }
  if (message.type === "set-product-sort") { sortMode = ["default", "price-asc", "price-desc"].includes(message.mode) ? message.mode : "price-asc"; chrome.storage.local.set({ [SORT_KEY]: sortMode }); applyProducts(); sendResponse(productState()); }
  if (message.type === "refresh-order-autofill") { autofillCache = null; autofill(); sendResponse({ refreshed: true }); }
  if (message.type === "get-order-info") { reply(orders(message.contact, message.page || 1, message.pageSize || 100)); return true; }
  if (message.type === "get-order-cards") { reply(cards(message.tradeNo, message.password)); return true; }
  if (message.type === "start-order-captcha") { reply(startCaptcha()); return true; }
  if (message.type === "verify-order-captcha") { reply(verifyCaptcha(message.code)); return true; }
});

(async () => { const settings = await chrome.storage.local.get({ [FILTER_KEY]: true, [SORT_KEY]: "price-asc" }); filterEnabled = settings[FILTER_KEY]; sortMode = settings[SORT_KEY]; applyProducts(); new MutationObserver(() => { applyProducts(); autofill().catch(() => {}); }).observe(document.documentElement, { childList: true, subtree: true }); autofill().catch(() => {}); })();
