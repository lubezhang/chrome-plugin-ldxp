const session = chrome.storage.session;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message?.type?.startsWith("session-")) return;
  const key = message.type === "session-password" ? "sessionOrderPassword" : "sessionOrderVerificationTicket";
  const reply = (task) => Promise.resolve(task).then(sendResponse).catch(() => sendResponse({ error: "会话存储不可用" }));
  if (message.action === "get") reply(session.get(key).then((value) => ({ value: value[key] || "" })));
  else if (message.action === "set") reply(session.set({ [key]: message.value || "" }).then(() => ({ saved: true })));
  else if (message.action === "clear") reply(session.remove(key).then(() => ({ cleared: true })));
  else sendResponse({ error: "未知的会话操作" });
  return true;
});
