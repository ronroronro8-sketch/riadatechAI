import { buildApiUrl } from "./httpClient";

async function request(path, { signal, method = "GET", body } = {}) {
  const response = await fetch(buildApiUrl(path), {
    method, signal, credentials: "include",
    headers: { "Content-Type": "application/json", "X-RiadaTech-Request": "1" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Conversation request failed.");
  return data;
}

export function createConversation(title, signal) {
  return request("/api/conversations", { method: "POST", body: { title: title.slice(0, 160) }, signal });
}

export async function loadConversation(id, signal) {
  let after = 0, conversation, messages = [];
  do {
    const page = await request(`/api/conversations/${encodeURIComponent(id)}?after=${after}`, { signal });
    conversation = page.conversation;
    messages.push(...page.messages);
    after = page.nextAfter;
  } while (after !== null && after !== undefined);
  return { conversation, messages };
}

export function listConversations(signal) {
  return request("/api/conversations", { signal });
}
