// Express 4 no captura errores de handlers async: sin esto, un fallo de
// Postgres queda como promesa rechazada y tumba el proceso. Lo reenvía al
// middleware de errores de server.js.
module.exports = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
