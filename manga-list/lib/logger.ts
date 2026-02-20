type LogMeta = unknown;

function formatMessage(message: string): string {
  return `[manga-list] ${message}`;
}

export const logger = {
  error(message: string, meta?: LogMeta): void {
    if (meta !== undefined) {
      console.error(formatMessage(message), meta);
      return;
    }
    console.error(formatMessage(message));
  },
  warn(message: string, meta?: LogMeta): void {
    if (meta !== undefined) {
      console.warn(formatMessage(message), meta);
      return;
    }
    console.warn(formatMessage(message));
  },
  info(message: string, meta?: LogMeta): void {
    if (meta !== undefined) {
      console.info(formatMessage(message), meta);
      return;
    }
    console.info(formatMessage(message));
  },
};
