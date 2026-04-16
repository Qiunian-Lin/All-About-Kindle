/**
 * js/sessionStore.js
 * 持久化存储模块 —— 基于 IndexedDB
 *
 * 数据库结构：
 *   DB: AllofKindleDB (v1)
 *   ├── sessions        对话会话表  { sessionId, deviceId, startTime, lastTime, title, messageCount }
 *   ├── messages        消息记录表  { id, sessionId, deviceId, role, content, timestamp, tokens }
 *   └── userProfiles    用户画像表  { deviceId, profile (JSON), updatedAt }
 */

const DB_NAME = 'AllofKindleDB';
const DB_VERSION = 1;

let _db = null;

/** 初始化 / 打开数据库 */
function openDB() {
  if (_db) return Promise.resolve(_db);

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;

      // ── sessions 表 ──────────────────────────────────────
      if (!db.objectStoreNames.contains('sessions')) {
        const sessionStore = db.createObjectStore('sessions', { keyPath: 'sessionId' });
        sessionStore.createIndex('byDevice', 'deviceId', { unique: false });
        sessionStore.createIndex('byLastTime', 'lastTime', { unique: false });
      }

      // ── messages 表 ──────────────────────────────────────
      if (!db.objectStoreNames.contains('messages')) {
        const msgStore = db.createObjectStore('messages', {
          keyPath: 'id',
          autoIncrement: true
        });
        msgStore.createIndex('bySession', 'sessionId', { unique: false });
        msgStore.createIndex('byDevice', 'deviceId', { unique: false });
        msgStore.createIndex('byTimestamp', 'timestamp', { unique: false });
      }

      // ── userProfiles 表 ──────────────────────────────────
      if (!db.objectStoreNames.contains('userProfiles')) {
        db.createObjectStore('userProfiles', { keyPath: 'deviceId' });
      }
    };

    req.onsuccess = (e) => {
      _db = e.target.result;
      resolve(_db);
    };

    req.onerror = () => reject(req.error);
  });
}

/** 通用 IDB 事务封装 */
function tx(storeName, mode, callback) {
  return openDB().then(db => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, mode);
      const store = transaction.objectStore(storeName);
      const result = callback(store);
      if (result && typeof result.onsuccess !== 'undefined') {
        result.onsuccess = () => resolve(result.result);
        result.onerror = () => reject(result.error);
      }
      transaction.oncomplete = () => resolve(result?.result);
      transaction.onerror = () => reject(transaction.error);
    });
  });
}

// ════════════════════════════════════════════════════════════
// Session 操作
// ════════════════════════════════════════════════════════════

/**
 * 创建新会话
 * @param {string} deviceId
 * @returns {Promise<string>} sessionId
 */
export async function createSession(deviceId) {
  const sessionId = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const now = Date.now();
  const session = {
    sessionId,
    deviceId,
    startTime: now,
    lastTime: now,
    title: '新对话',
    messageCount: 0
  };

  await tx('sessions', 'readwrite', store => store.add(session));
  console.log('[Store] 创建会话:', sessionId);
  return sessionId;
}

/**
 * 获取设备的所有历史会话（按最后时间降序）
 * @param {string} deviceId
 * @returns {Promise<Array>}
 */
export function getSessionsByDevice(deviceId) {
  return openDB().then(db => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('sessions', 'readonly');
      const store = transaction.objectStore('sessions');
      const index = store.index('byDevice');
      const req = index.getAll(deviceId);
      req.onsuccess = () => {
        const sessions = req.result.sort((a, b) => b.lastTime - a.lastTime);
        resolve(sessions);
      };
      req.onerror = () => reject(req.error);
    });
  });
}

/**
 * 更新会话元数据（标题、最后时间、消息计数）
 */
export async function updateSession(sessionId, updates) {
  return openDB().then(db => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('sessions', 'readwrite');
      const store = transaction.objectStore('sessions');
      const getReq = store.get(sessionId);
      getReq.onsuccess = () => {
        const session = getReq.result;
        if (!session) return reject(new Error('Session not found'));
        Object.assign(session, updates, { lastTime: Date.now() });
        store.put(session);
        transaction.oncomplete = () => resolve(session);
      };
      getReq.onerror = () => reject(getReq.error);
    });
  });
}

/**
 * 删除会话及其所有消息
 */
export async function deleteSession(sessionId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['sessions', 'messages'], 'readwrite');

    // 删除 session 记录
    transaction.objectStore('sessions').delete(sessionId);

    // 删除该 session 的所有消息
    const msgStore = transaction.objectStore('messages');
    const index = msgStore.index('bySession');
    const cursorReq = index.openCursor(IDBKeyRange.only(sessionId));
    cursorReq.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

// ════════════════════════════════════════════════════════════
// Message 操作
// ════════════════════════════════════════════════════════════

/**
 * 保存一条消息
 * @param {object} msg { sessionId, deviceId, role, content, tokens? }
 * @returns {Promise<number>} 消息自增 id
 */
export async function saveMessage(msg) {
  const record = {
    sessionId: msg.sessionId,
    deviceId: msg.deviceId,
    role: msg.role,         // 'user' | 'assistant'
    content: msg.content,
    timestamp: Date.now(),
    tokens: msg.tokens || 0
  };

  const id = await tx('messages', 'readwrite', store => store.add(record));

  // 同步更新 session 的 lastTime 和 messageCount
  await updateSession(msg.sessionId, {
    messageCount: await getMessageCount(msg.sessionId)
  });

  return id;
}

/**
 * 获取某会话的全部消息（时间升序）
 */
export function getMessages(sessionId) {
  return openDB().then(db => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('messages', 'readonly');
      const index = transaction.objectStore('messages').index('bySession');
      const req = index.getAll(IDBKeyRange.only(sessionId));
      req.onsuccess = () => {
        resolve(req.result.sort((a, b) => a.timestamp - b.timestamp));
      };
      req.onerror = () => reject(req.error);
    });
  });
}

/**
 * 获取某设备所有历史消息（用于画像构建）
 * @param {string} deviceId
 * @param {number} limit 最多条数，默认 200
 */
export function getAllMessagesByDevice(deviceId, limit = 200) {
  return openDB().then(db => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('messages', 'readonly');
      const index = transaction.objectStore('messages').index('byDevice');
      const req = index.getAll(IDBKeyRange.only(deviceId));
      req.onsuccess = () => {
        const msgs = req.result
          .sort((a, b) => b.timestamp - a.timestamp)
          .slice(0, limit);
        resolve(msgs);
      };
      req.onerror = () => reject(req.error);
    });
  });
}

/**
 * 获取某会话消息数
 */
function getMessageCount(sessionId) {
  return openDB().then(db => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('messages', 'readonly');
      const index = transaction.objectStore('messages').index('bySession');
      const req = index.count(IDBKeyRange.only(sessionId));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  });
}

// ════════════════════════════════════════════════════════════
// UserProfile 操作
// ════════════════════════════════════════════════════════════

/**
 * 读取用户画像
 */
export function getProfile(deviceId) {
  return openDB().then(db => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('userProfiles', 'readonly');
      const req = transaction.objectStore('userProfiles').get(deviceId);
      req.onsuccess = () => resolve(req.result?.profile || null);
      req.onerror = () => reject(req.error);
    });
  });
}

/**
 * 保存 / 更新用户画像
 * @param {string} deviceId
 * @param {object} profile
 */
export async function saveProfile(deviceId, profile) {
  await tx('userProfiles', 'readwrite', store => store.put({
    deviceId,
    profile,
    updatedAt: Date.now()
  }));
  console.log('[Store] 画像已更新:', deviceId);
}

/**
 * 清除某设备所有数据（GDPR 友好）
 */
export async function clearAllData(deviceId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['sessions', 'messages', 'userProfiles'], 'readwrite');

    transaction.objectStore('userProfiles').delete(deviceId);

    // 清 sessions
    const sessIdx = transaction.objectStore('sessions').index('byDevice');
    const sessCursor = sessIdx.openCursor(IDBKeyRange.only(deviceId));
    sessCursor.onsuccess = e => {
      const c = e.target.result;
      if (c) { c.delete(); c.continue(); }
    };

    // 清 messages
    const msgIdx = transaction.objectStore('messages').index('byDevice');
    const msgCursor = msgIdx.openCursor(IDBKeyRange.only(deviceId));
    msgCursor.onsuccess = e => {
      const c = e.target.result;
      if (c) { c.delete(); c.continue(); }
    };

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

/**
 * 获取存储统计信息
 */
export async function getStorageStats(deviceId) {
  const [sessions, messages, profile] = await Promise.all([
    getSessionsByDevice(deviceId),
    getAllMessagesByDevice(deviceId, 9999),
    getProfile(deviceId)
  ]);

  return {
    sessionCount: sessions.length,
    messageCount: messages.length,
    hasProfile: !!profile,
    oldestMessage: messages.length ? new Date(messages[messages.length - 1].timestamp) : null,
    newestMessage: messages.length ? new Date(messages[0].timestamp) : null
  };
}
