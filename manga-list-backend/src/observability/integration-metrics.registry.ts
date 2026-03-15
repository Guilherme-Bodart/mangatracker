type IntegrationMetricsState = {
  startedAtMs: number;
  sync: {
    created: number;
    updated: number;
    noop: number;
    rejected: number;
    rejectedByReason: Record<string, number>;
  };
  exchange: {
    success: number;
    rejected: number;
    rejectedByReason: Record<string, number>;
  };
  webhook: {
    delivered: number;
    retry: number;
    dlq: number;
  };
};

const state: IntegrationMetricsState = {
  startedAtMs: Date.now(),
  sync: {
    created: 0,
    updated: 0,
    noop: 0,
    rejected: 0,
    rejectedByReason: {},
  },
  exchange: {
    success: 0,
    rejected: 0,
    rejectedByReason: {},
  },
  webhook: {
    delivered: 0,
    retry: 0,
    dlq: 0,
  },
};

export function recordIntegrationSyncOutcome(
  outcome: 'created' | 'updated' | 'noop' | 'rejected',
  reason?: string,
): void {
  state.sync[outcome] += 1;
  if (outcome === 'rejected' && reason?.trim()) {
    const key = reason.trim();
    state.sync.rejectedByReason[key] = (state.sync.rejectedByReason[key] ?? 0) + 1;
  }
}

export function recordIntegrationExchangeResult(
  outcome: 'success' | 'rejected',
  reason?: string,
): void {
  state.exchange[outcome] += 1;
  if (outcome === 'rejected' && reason?.trim()) {
    const key = reason.trim();
    state.exchange.rejectedByReason[key] =
      (state.exchange.rejectedByReason[key] ?? 0) + 1;
  }
}

export function recordIntegrationWebhookDelivery(
  status: 'DELIVERED' | 'RETRY' | 'DLQ',
): void {
  if (status === 'DELIVERED') {
    state.webhook.delivered += 1;
    return;
  }
  if (status === 'RETRY') {
    state.webhook.retry += 1;
    return;
  }
  state.webhook.dlq += 1;
}

export function getIntegrationMetricsSnapshot() {
  const totalSync =
    state.sync.created +
    state.sync.updated +
    state.sync.noop +
    state.sync.rejected;
  const totalExchange = state.exchange.success + state.exchange.rejected;

  return {
    startedAt: new Date(state.startedAtMs).toISOString(),
    sync: {
      total: totalSync,
      created: state.sync.created,
      updated: state.sync.updated,
      noop: state.sync.noop,
      rejected: state.sync.rejected,
      rejectedByReason: { ...state.sync.rejectedByReason },
      rejectedRate: totalSync > 0 ? state.sync.rejected / totalSync : 0,
    },
    exchange: {
      total: totalExchange,
      success: state.exchange.success,
      rejected: state.exchange.rejected,
      rejectedByReason: { ...state.exchange.rejectedByReason },
      rejectionRate: totalExchange > 0 ? state.exchange.rejected / totalExchange : 0,
    },
    webhook: {
      delivered: state.webhook.delivered,
      retry: state.webhook.retry,
      dlq: state.webhook.dlq,
    },
  };
}

export function resetIntegrationMetricsForTests(): void {
  state.startedAtMs = Date.now();
  state.sync.created = 0;
  state.sync.updated = 0;
  state.sync.noop = 0;
  state.sync.rejected = 0;
  state.sync.rejectedByReason = {};
  state.exchange.success = 0;
  state.exchange.rejected = 0;
  state.exchange.rejectedByReason = {};
  state.webhook.delivered = 0;
  state.webhook.retry = 0;
  state.webhook.dlq = 0;
}
