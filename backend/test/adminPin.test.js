const test = require('node:test');
const assert = require('node:assert/strict');
const { createRequireAdminPin } = require('../src/lib/adminPin');

// Respuesta falsa de express: guarda el status y el cuerpo.
function fakeRes() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

// Corre el middleware y devuelve { res, nextCalled, nextErr, calls }.
async function run({ enforced = true, body = {}, upstream, throws }) {
  const calls = [];
  const middleware = createRequireAdminPin({
    isEnforced: () => enforced,
    call: async (path, options) => {
      calls.push({ path, options });
      if (throws) throw throws;
      return upstream;
    },
  });
  const res = fakeRes();
  let nextCalled = false;
  let nextErr;
  await middleware({ body, accessToken: 'tok' }, res, (err) => {
    nextCalled = true;
    nextErr = err;
  });
  return { res, nextCalled, nextErr, calls };
}

test('con ADMIN_PIN_ENFORCED apagado deja pasar sin pedir PIN ni llamar a la auth-api', async () => {
  const { nextCalled, calls } = await run({ enforced: false });
  assert.equal(nextCalled, true);
  assert.equal(calls.length, 0);
});

test('sin PIN responde 403 pin_required y no llama a la auth-api', async () => {
  const { res, nextCalled, calls } = await run({});
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, 'pin_required');
  assert.equal(calls.length, 0);
});

test('un PIN que no son 6 dígitos responde 400 sin gastar un intento', async () => {
  for (const pin of ['12345', '1234567', 'abcdef', '12 456', 123456]) {
    const { res, nextCalled, calls } = await run({ body: { pin } });
    assert.equal(nextCalled, false, String(pin));
    assert.equal(res.statusCode, 400, String(pin));
    assert.equal(res.body.code, 'pin_invalid_format', String(pin));
    assert.equal(calls.length, 0, String(pin));
  }
});

test('PIN correcto: verifica con la sesión de quien actúa y continúa', async () => {
  const { nextCalled, calls } = await run({
    body: { pin: '123456' },
    upstream: { status: 204, data: null },
  });
  assert.equal(nextCalled, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, '/auth/pin/verify');
  assert.deepEqual(calls[0].options.body, { pin: '123456' });
  assert.equal(calls[0].options.headers.Authorization, 'Bearer tok');
});

test('PIN incorrecto: reenvía 403 con los intentos que quedan y no continúa', async () => {
  const data = { error: 'PIN inválido', code: 'pin_invalid', attempts_left: 3 };
  const { res, nextCalled } = await run({ body: { pin: '000000' }, upstream: { status: 403, data } });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, data);
});

test('PIN bloqueado: reenvía 423 con el tiempo restante', async () => {
  const data = { error: 'PIN bloqueado', code: 'pin_locked', retry_after_seconds: 600 };
  const { res, nextCalled } = await run({ body: { pin: '000000' }, upstream: { status: 423, data } });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 423);
  assert.equal(res.body.retry_after_seconds, 600);
});

test('cuenta sin PIN: reenvía 409 pin_not_set', async () => {
  const data = { error: 'la cuenta no tiene PIN configurado', code: 'pin_not_set' };
  const { res, nextCalled } = await run({ body: { pin: '123456' }, upstream: { status: 409, data } });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.code, 'pin_not_set');
});

test('un 401 de la auth-api se traduce a invalid_token para que la app renueve la sesión', async () => {
  const { res, nextCalled } = await run({
    body: { pin: '123456' },
    upstream: { status: 401, data: { error: 'no autorizado' } },
  });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.code, 'invalid_token');
});

test('si la auth-api no responde, pasa el error al manejador y no confirma la acción', async () => {
  const boom = new Error('sin conexión');
  const { nextCalled, nextErr, res } = await run({ body: { pin: '123456' }, throws: boom });
  assert.equal(nextCalled, true);
  assert.equal(nextErr, boom);
  assert.equal(res.statusCode, null);
});
