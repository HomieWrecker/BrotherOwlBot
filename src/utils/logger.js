export function log(message, ...args) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [INFO]`, message, ...args);
}

export function logError(message, ...args) {
  const timestamp = new Date().toISOString();
  console.error(`[${timestamp}] [ERROR]`, message, ...args);
}
