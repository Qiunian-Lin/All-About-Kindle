// lib/sessionStore.ts

const HISTORY_KEY_PREFIX = "all_of_kindle_history_";
const PROFILE_KEY_PREFIX = "all_of_kindle_profile_";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  ts: number;
};

/**
 * 获取历史对话
 */
export function loadHistory(visitorId: string): ChatMessage[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY_PREFIX + visitorId);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error("loadHistory error:", e);
    return [];
  }
}

/**
 * 保存单条消息（自动裁剪长度）
 */
export function saveMessage(visitorId: string, message: ChatMessage) {
  try {
    const history = loadHistory(visitorId);
    history.push(message);

    // 控制长度（避免 localStorage 爆）
    const trimmed = history.slice(-40);

    localStorage.setItem(
      HISTORY_KEY_PREFIX + visitorId,
      JSON.stringify(trimmed)
    );
  } catch (e) {
    console.error("saveMessage error:", e);
  }
}

/**
 * 清空历史（可用于“新对话”）
 */
export function clearHistory(visitorId: string) {
  try {
    localStorage.removeItem(HISTORY_KEY_PREFIX + visitorId);
  } catch (e) {
    console.error("clearHistory error:", e);
  }
}

/**
 * 获取用户画像
 */
export function loadProfile(visitorId: string) {
  try {
    const raw = localStorage.getItem(PROFILE_KEY_PREFIX + visitorId);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    console.error("loadProfile error:", e);
    return {};
  }
}

/**
 * 保存用户画像
 */
export function saveProfile(visitorId: string, profile: any) {
  try {
    localStorage.setItem(
      PROFILE_KEY_PREFIX + visitorId,
      JSON.stringify(profile)
    );
  } catch (e) {
    console.error("saveProfile error:", e);
  }
}

/**
 * 清除用户画像
 */
export function clearProfile(visitorId: string) {
  try {
    localStorage.removeItem(PROFILE_KEY_PREFIX + visitorId);
  } catch (e) {
    console.error("clearProfile error:", e);
  }
}

/**
 * 获取最近N条对话（给 AI 用）
 */
export function getRecentMemory(visitorId: string, limit = 8): ChatMessage[] {
  const history = loadHistory(visitorId);
  return history.slice(-limit);
}
