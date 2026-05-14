const fs = require('node:fs/promises');
const path = require('node:path');

function loadEnvFiles(filePaths) {
  const values = {};

  for (const filePath of filePaths) {
    try {
      const content = require('node:fs').readFileSync(filePath, 'utf8');
      const lines = content.split(/\r?\n/);

      for (const line of lines) {
        const trimmed = line.trim();

        if (!trimmed || trimmed.startsWith('#')) {
          continue;
        }

        const separatorIndex = trimmed.indexOf('=');

        if (separatorIndex <= 0) {
          continue;
        }

        const key = trimmed.slice(0, separatorIndex).trim();
        let value = trimmed.slice(separatorIndex + 1).trim();

        if (
          (value.startsWith('"') && value.endsWith('"'))
          || (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }

        values[key] = value;
      }
    } catch {
      continue;
    }
  }

  return values;
}

const FILE_ENV = loadEnvFiles([
  path.resolve(__dirname, '..', '.env'),
  path.resolve(__dirname, '..', 'backend', '.env'),
]);

function readConfigValue(name, fallback = '') {
  const processValue = typeof process.env[name] === 'string' ? process.env[name].trim() : '';

  if (processValue) {
    return processValue;
  }

  const fileValue = typeof FILE_ENV[name] === 'string' ? FILE_ENV[name].trim() : '';

  if (fileValue) {
    return fileValue;
  }

  return fallback;
}

function isE164PhoneNumber(value) {
  return /^\+[1-9]\d{7,14}$/.test(value);
}

function isNon555PhoneNumber(value) {
  return !/555/.test(value);
}

const BACKEND_URL = readConfigValue('SMS_SMOKE_BACKEND_URL', 'http://localhost:4000').replace(/\/$/, '');
const OFFICE_EMAIL = readConfigValue('SMS_SMOKE_OFFICE_EMAIL', 'admin@wizfield.local');
const OFFICE_PASSWORD = readConfigValue('SMS_SMOKE_OFFICE_PASSWORD', 'Admin12345!');
const TECH_EMAIL = readConfigValue('SMS_SMOKE_TECH_EMAIL');
const TECH_PASSWORD = readConfigValue('SMS_SMOKE_TECH_PASSWORD');
const CONVERSATION_ID = readConfigValue('SMS_SMOKE_CONVERSATION_ID');
const SMOKE_TO_NUMBER = readConfigValue('SMS_SMOKE_TO_NUMBER');
const SEND_BODY = readConfigValue('SMS_SMOKE_SEND_BODY', 'WizField SMS smoke test');
const WEBHOOK_FILE = readConfigValue('SMS_SMOKE_WEBHOOK_FILE');
const WEBHOOK_SIGNATURE = readConfigValue('SMS_SMOKE_WEBHOOK_SIGNATURE');
const WEBHOOK_TIMESTAMP = readConfigValue('SMS_SMOKE_WEBHOOK_TIMESTAMP');

function createResult() {
  return {
    backendUrl: BACKEND_URL,
    officeLogin: false,
    conversationList: false,
    shortLinkCreate: false,
    shortLinkResolve: false,
    threadLoad: false,
    markRead: false,
    outboundSendAttempted: false,
    outboundSendSucceeded: false,
    outboundSendFailedStateObserved: false,
    providerMessageIdStored: false,
    finalDeliveryStatus: null,
    failedSendPathStillObservable: false,
    webhookReplayAttempted: false,
    inboundReplayAccepted: false,
    duplicateReplayBlocked: false,
    technicianDenied: false,
    blockers: [],
    details: {},
  };
}

function extractCookieHeader(response) {
  const getSetCookie = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : [];
  const rawCookies = getSetCookie.length
    ? getSetCookie
    : [response.headers.get('set-cookie')].filter(Boolean);

  return rawCookies
    .map((value) => String(value).split(';', 1)[0].trim())
    .filter(Boolean)
    .join('; ');
}

async function requestJson(url, init = {}) {
  const response = await fetch(url, init);
  const text = await response.text();
  let payload = null;

  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  return { response, payload, text };
}

async function login(email, password) {
  const { response, payload, text } = await requestJson(`${BACKEND_URL}/api/auth/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    throw new Error(payload?.error?.message || text || `Login failed with status ${response.status}`);
  }

  const cookie = extractCookieHeader(response);

  if (!cookie) {
    throw new Error('Login succeeded but no auth cookie was returned.');
  }

  return {
    cookie,
    session: payload?.data || null,
  };
}

async function authedGet(cookie, route) {
  return requestJson(`${BACKEND_URL}${route}`, {
    headers: {
      cookie,
    },
  });
}

async function authedPost(cookie, route, body) {
  return requestJson(`${BACKEND_URL}${route}`, {
    method: 'POST',
    headers: {
      cookie,
      'content-type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function toShortLinkPayload(conversationId) {
  if (conversationId.startsWith('customer:')) {
    return {
      lane: 'customers',
      customerId: conversationId.slice('customer:'.length),
    };
  }

  if (conversationId.startsWith('phone:')) {
    return {
      lane: 'unknown',
      phoneKey: conversationId.slice('phone:'.length),
    };
  }

  return null;
}

function latestOutboundStatus(threadItems) {
  return (threadItems || []).find((item) => item.direction === 'outbound') || null;
}

async function tryResolveShortLink(cookie, payload, result, detailPrefix = 'shortLink') {
  const shortLink = await authedPost(cookie, '/api/messaging/conversations/short-link', payload);

  result.details[`${detailPrefix}CreateStatus`] = shortLink.response.status;

  if (!shortLink.response.ok || !shortLink.payload?.data?.publicConversationCode) {
    result.details[`${detailPrefix}CreateResponse`] = shortLink.payload;
    return false;
  }

  result.shortLinkCreate = true;
  result.details.shortLink = shortLink.payload.data;

  const resolved = await authedGet(cookie, `/api/messaging/conversations/short-link/${encodeURIComponent(shortLink.payload.data.publicConversationCode)}`);
  result.details[`${detailPrefix}ResolveStatus`] = resolved.response.status;

  if (resolved.response.ok && resolved.payload?.data?.publicConversationCode) {
    result.shortLinkResolve = true;
    result.details.shortLinkResolved = resolved.payload.data;
    return true;
  }

  result.details[`${detailPrefix}ResolveResponse`] = resolved.payload;
  return false;
}

async function replayWebhook(result) {
  if (!WEBHOOK_FILE) {
    result.blockers.push('Webhook replay skipped: SMS_SMOKE_WEBHOOK_FILE not provided.');
    return;
  }

  if (!WEBHOOK_SIGNATURE || !WEBHOOK_TIMESTAMP) {
    result.blockers.push('Webhook replay skipped: SMS_SMOKE_WEBHOOK_SIGNATURE and SMS_SMOKE_WEBHOOK_TIMESTAMP are required for TXT webhook verification.');
    return;
  }

  const payloadPath = path.resolve(WEBHOOK_FILE);
  const rawPayload = await fs.readFile(payloadPath, 'utf8');
  result.webhookReplayAttempted = true;

  const first = await fetch(`${BACKEND_URL}/api/webhooks/telnyx/txt`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'telnyx-signature-ed25519': WEBHOOK_SIGNATURE,
      'telnyx-timestamp': WEBHOOK_TIMESTAMP,
    },
    body: rawPayload,
  });
  const firstJson = await first.json().catch(() => null);
  const second = await fetch(`${BACKEND_URL}/api/webhooks/telnyx/txt`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'telnyx-signature-ed25519': WEBHOOK_SIGNATURE,
      'telnyx-timestamp': WEBHOOK_TIMESTAMP,
    },
    body: rawPayload,
  });
  const secondJson = await second.json().catch(() => null);

  result.details.webhookFirst = firstJson;
  result.details.webhookSecond = secondJson;
  result.inboundReplayAccepted = Boolean(first.ok && firstJson?.data?.received);
  result.duplicateReplayBlocked = Boolean(second.ok && secondJson?.data?.duplicate);
}

async function main() {
  const result = createResult();

  try {
    const office = await login(OFFICE_EMAIL, OFFICE_PASSWORD);
    result.officeLogin = true;
    result.details.officeSessionRole = office.session?.profile?.role || null;

    if (SMOKE_TO_NUMBER) {
      result.details.smsSmokeToNumberProvided = true;
      result.details.smsSmokeToNumberValid = isE164PhoneNumber(SMOKE_TO_NUMBER);
      result.details.smsSmokeToNumberNon555 = isNon555PhoneNumber(SMOKE_TO_NUMBER);

      if (!isE164PhoneNumber(SMOKE_TO_NUMBER)) {
        result.blockers.push('SMS_SMOKE_TO_NUMBER must be a real E.164 number.');
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      if (!isNon555PhoneNumber(SMOKE_TO_NUMBER)) {
        result.blockers.push('SMS_SMOKE_TO_NUMBER must not be a 555 test number.');
        console.log(JSON.stringify(result, null, 2));
        return;
      }
    }

    const conversations = await authedGet(office.cookie, '/api/messaging/txt/conversations?limit=25');
    if (!conversations.response.ok) {
      throw new Error(conversations.payload?.error?.message || conversations.text || 'Failed to list TXT conversations.');
    }

    result.conversationList = true;
    const items = conversations.payload?.data?.items || [];
    result.details.conversationCount = items.length;

    const targetConversationId = CONVERSATION_ID || (SMOKE_TO_NUMBER ? `phone:${SMOKE_TO_NUMBER}` : items[0]?.id || null);
    result.details.targetConversationId = targetConversationId;

    if (!targetConversationId) {
      result.blockers.push('No TXT conversation available. Provide SMS_SMOKE_CONVERSATION_ID or seed a conversation first.');
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    const shortLinkPayload = toShortLinkPayload(targetConversationId);

    if (!shortLinkPayload) {
      result.blockers.push(`Unsupported conversation id format: ${targetConversationId}`);
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    await tryResolveShortLink(office.cookie, shortLinkPayload, result, 'preSendShortLink');

    const thread = await authedGet(office.cookie, `/api/messaging/txt/conversations/${encodeURIComponent(targetConversationId)}/messages?limit=50`);
    if (!thread.response.ok) {
      throw new Error(thread.payload?.error?.message || thread.text || 'Failed to load TXT thread.');
    }

    result.threadLoad = true;
    result.details.threadCount = thread.payload?.data?.items?.length || 0;

    const markRead = await authedPost(office.cookie, `/api/messaging/txt/conversations/${encodeURIComponent(targetConversationId)}/messages/mark-read`, {});
    if (markRead.response.ok) {
      result.markRead = true;
      result.details.markReadUnreadCount = markRead.payload?.data?.unreadCount ?? null;
    }

    const sendAttempt = await authedPost(office.cookie, '/api/messaging/txt/send', {
      conversationId: targetConversationId,
      body: SEND_BODY,
    });
    result.outboundSendAttempted = true;
    result.details.sendResponseStatus = sendAttempt.response.status;
    result.details.sendResponse = sendAttempt.payload;

    if (sendAttempt.response.ok) {
      const latest = latestOutboundStatus(sendAttempt.payload?.data?.items || []);
      result.outboundSendSucceeded = latest?.deliveryStatus === 'sent';
      result.outboundSendFailedStateObserved = latest?.deliveryStatus === 'failed_delivery' || latest?.deliveryStatus === 'failed';
      result.providerMessageIdStored = Boolean(latest?.providerMessageId);
      result.finalDeliveryStatus = latest?.deliveryStatus ?? null;
      result.failedSendPathStillObservable = Boolean(
        (sendAttempt.payload?.data?.items || []).some((item) => item.deliveryStatus === 'failed_delivery' || item.deliveryStatus === 'failed')
      );
      result.details.latestOutbound = latest;

      if (!result.shortLinkCreate || !result.shortLinkResolve) {
        await tryResolveShortLink(office.cookie, shortLinkPayload, result, 'postSendShortLink');
      }
    } else {
      result.blockers.push(sendAttempt.payload?.error?.message || sendAttempt.text || 'TXT send attempt failed before delivery-state inspection.');
    }

    await replayWebhook(result);

    if (TECH_EMAIL && TECH_PASSWORD) {
      try {
        const technician = await login(TECH_EMAIL, TECH_PASSWORD);
        const denied = await authedGet(technician.cookie, '/api/messaging/txt/conversations?limit=5');
        result.technicianDenied = denied.response.status === 403;
        result.details.technicianStatus = denied.response.status;
        result.details.technicianResponse = denied.payload;
      } catch (error) {
        result.blockers.push(`Technician denial check could not log in: ${error instanceof Error ? error.message : 'unknown error'}`);
      }
    } else {
      result.blockers.push('Technician denial check skipped: SMS_SMOKE_TECH_EMAIL and SMS_SMOKE_TECH_PASSWORD not provided.');
    }
  } catch (error) {
    result.blockers.push(error instanceof Error ? error.message : 'Unknown SMS smoke error.');
  }

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
