/** One-line structured logger: `ts level service msg reqId=… key=value …` */
export function createLogger(service, { out = (l) => process.stdout.write(`${l}\n`), err = (l) => process.stderr.write(`${l}\n`) } = {}) {
  const fmt = (level, msg, fields = {}) => {
    const extra = Object.entries(fields)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => `${k}=${typeof v === 'string' && /\s/.test(v) ? JSON.stringify(v) : v}`)
      .join(' ');
    return `${new Date().toISOString()} ${level} ${service} ${msg}${extra ? ` ${extra}` : ''}`;
  };
  return {
    info: (msg, f) => out(fmt('info', msg, f)),
    warn: (msg, f) => err(fmt('warn', msg, f)),
    error: (msg, f) => err(fmt('error', msg, f)),
  };
}
