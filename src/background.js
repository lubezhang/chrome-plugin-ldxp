const session = chrome.storage.session;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message?.type?.startsWith("session-")) return;
  const key = message.type === "session-password" ? "sessionOrderPassword" : "sessionOrderVerificationTicket";
  if (message.action === "get") session.get(key).then((value) => sendResponse({ value: value[key] || "" }));
  if (message.action === "set") session.set({ [key]: message.value || "" }).then(() => sendResponse({ saved: true }));
  if (message.action === "clear") session.remove(key).then(() => sendResponse({ cleared: true }));
  return true;
});
