const SESSION_ORDER_PASSWORD_KEY = "sessionOrderPassword";
const SESSION_ORDER_TICKET_KEY = "sessionOrderVerificationTicket";

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "get-session-order-password") {
    chrome.storage.session.get({ [SESSION_ORDER_PASSWORD_KEY]: "" })
      .then((values) => sendResponse({ password: values[SESSION_ORDER_PASSWORD_KEY] || "" }))
      .catch(() => sendResponse({ password: "" }));
    return true;
  }
  if (message.type === "get-session-order-ticket") {
    chrome.storage.session.get({ [SESSION_ORDER_TICKET_KEY]: "" })
      .then((values) => sendResponse({ ticket: values[SESSION_ORDER_TICKET_KEY] || "" }))
      .catch(() => sendResponse({ ticket: "" }));
    return true;
  }
  if (message.type === "set-session-order-ticket") {
    chrome.storage.session.set({ [SESSION_ORDER_TICKET_KEY]: message.ticket || "" })
      .then(() => sendResponse({ saved: true }))
      .catch(() => sendResponse({ saved: false }));
    return true;
  }
  if (message.type === "clear-session-order-ticket") {
    chrome.storage.session.remove(SESSION_ORDER_TICKET_KEY)
      .then(() => sendResponse({ cleared: true }))
      .catch(() => sendResponse({ cleared: false }));
    return true;
  }
});
