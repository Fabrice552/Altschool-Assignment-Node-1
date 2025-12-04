const url = require('url');
const storage = require('./storage');
const { randomUUID } = require('crypto');

function sendJSON(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function parseJSONBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk.toString();
      if (data.length > 1e6) {
        req.socket.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        const parsed = JSON.parse(data);
        resolve(parsed);
      } catch (err) {
        reject(new Error('Invalid JSON body'));
      }
    });
  });
}

function validateItemInput(obj, partial = false) {
  const errors = [];
  if (!partial || Object.prototype.hasOwnProperty.call(obj, 'name')) {
    if (typeof obj.name !== 'string' || obj.name.trim() === '') {
      errors.push('name is required and must be a non-empty string');
    }
  }
  if (!partial || Object.prototype.hasOwnProperty.call(obj, 'price')) {
    if (typeof obj.price !== 'number' || Number.isNaN(obj.price)) {
      errors.push('price is required and must be a number');
    }
  }
  if (!partial || Object.prototype.hasOwnProperty.call(obj, 'size')) {
    const allowed = ['s', 'm', 'l', 'small', 'medium', 'large'];
    if (typeof obj.size !== 'string' || !allowed.includes(obj.size.toLowerCase())) {
      errors.push('size is required and must be one of s,m,l or small,medium,large');
    }
  }
  return errors;
}

function normalizeSize(size) {
  if (!size) return size;
  const s = size.toString().toLowerCase();
  if (s === 'small') return 's';
  if (s === 'medium') return 'm';
  if (s === 'large') return 'l';
  if (['s','m','l'].includes(s)) return s;
  return size;
}

async function handleGetAll(req, res) {
  const parsed = url.parse(req.url, true);
  const queryId = parsed.query && parsed.query.id;
  if (queryId) {
    return handleGetOne(req, res, queryId);
  }
  const items = await storage.getAll();
  sendJSON(res, 200, { success: true, data: items, error: null });
}

async function handleGetOne(req, res, id) {
  const item = await storage.getById(id);
  if (!item) {
    sendJSON(res, 404, { success: false, data: null, error: 'Item not found' });
    return;
  }
  sendJSON(res, 200, { success: true, data: item, error: null });
}

async function handleCreate(req, res) {
  try {
    const body = await parseJSONBody(req);
    const errors = validateItemInput(body, false);
    if (errors.length > 0) {
      sendJSON(res, 400, { success: false, data: null, error: errors.join('; ') });
      return;
    }
    const item = {
      id: String(randomUUID()),
      name: body.name.trim(),
      price: Number(body.price),
      size: normalizeSize(body.size)
    };
    await storage.create(item);
    sendJSON(res, 201, { success: true, data: item, error: null });
  } catch (err) {
    sendJSON(res, 400, { success: false, data: null, error: err.message });
  }
}

async function handleUpdate(req, res, idFromPath) {
  try {
    const body = await parseJSONBody(req);
    // Try id from query/path/body (compat with the teaching sample)
    const parsed = url.parse(req.url, true);
    const queryId = parsed.query && parsed.query.id;
    const id = idFromPath || queryId || body.id;
    if (!id) {
      sendJSON(res, 400, { success: false, data: null, error: 'id is required to update an item' });
      return;
    }

    const exists = await storage.getById(id);
    if (!exists) {
      sendJSON(res, 404, { success: false, data: null, error: 'Item not found' });
      return;
    }

    if (Object.keys(body).length === 0) {
      sendJSON(res, 400, { success: false, data: null, error: 'Empty body' });
      return;
    }

    const errors = validateItemInput(body, true);
    if (errors.length > 0) {
      sendJSON(res, 400, { success: false, data: null, error: errors.join('; ') });
      return;
    }

    const patch = {};
    if (body.name !== undefined) patch.name = body.name.trim();
    if (body.price !== undefined) patch.price = Number(body.price);
    if (body.size !== undefined) patch.size = normalizeSize(body.size);

    const updated = await storage.update(id, patch);
    sendJSON(res, 200, { success: true, data: updated, error: null });
  } catch (err) {
    sendJSON(res, 400, { success: false, data: null, error: err.message });
  }
}

async function handleDelete(req, res, idFromPath) {
  const parsed = url.parse(req.url, true);
  const queryId = parsed.query && parsed.query.id;
  const id = idFromPath || queryId;

  if (!id) {
    // delete all
    const result = await storage.remove();
    sendJSON(res, 200, { success: true, data: { removed: result.removed }, error: null });
    return;
  }

  const result = await storage.remove(id);
  if (result.removed === 0) {
    sendJSON(res, 404, { success: false, data: null, error: 'Item not found' });
    return;
  }
  sendJSON(res, 200, { success: true, data: { id: String(id) }, error: null });
}

function notFound(res) {
  sendJSON(res, 404, { success: false, data: null, error: 'Not Found' });
}

function methodNotAllowed(res) {
  sendJSON(res, 405, { success: false, data: null, error: 'Method Not Allowed' });
}

exports.handle = async function (req, res) {
  const parsed = url.parse(req.url, true);
  const parts = parsed.pathname.replace(/^\/+|\/+$/g, '').split('/'); // trim slashes
  // path like api/items or api/items/:id
  if (parts.length >= 2 && parts[0] === 'api' && parts[1] === 'items') {
    // pick id from path segment if provided
    const idFromPath = parts[2]; // may be undefined
    if (!idFromPath) {
      // /api/items or /api/items?=id
      if (req.method === 'GET') return handleGetAll(req, res);
      if (req.method === 'POST') return handleCreate(req, res);
      if (req.method === 'PUT') return handleUpdate(req, res, null);
      if (req.method === 'DELETE') return handleDelete(req, res, null);
      return methodNotAllowed(res);
    } else {
      // /api/items/:id
      if (req.method === 'GET') return handleGetOne(req, res, idFromPath);
      if (req.method === 'PUT') return handleUpdate(req, res, idFromPath);
      if (req.method === 'DELETE') return handleDelete(req, res, idFromPath);
      return methodNotAllowed(res);
    }
  } else {
    notFound(res);
  }
};