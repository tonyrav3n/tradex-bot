const flows = new Map();

export function getFlow(userId) {
  return flows.get(userId) ?? null;
}

export function hasFlow(userId) {
  return flows.has(userId);
}

export function startFlow(userId, initial = {}) {
  const now = Date.now();
  const flow = {
    initiatorId: userId,
    createdAt: now,
    updatedAt: now,
    ...initial,
  };
  flows.set(userId, flow);
  return flow;
}

export function setFlow(userId, partial) {
  const prev = flows.get(userId) ?? {
    initiatorId: userId,
    createdAt: Date.now(),
  };

  const next = {
    ...prev,
    ...partial,
    updatedAt: Date.now(),
  };

  flows.set(userId, next);
  return next;
}

export function clearFlow(userId) {
  return flows.delete(userId);
}

export function resetAllFlows() {
  flows.clear();
}

export function dumpFlows() {
  return Array.from(flows.entries()).map(([userId, flow]) => ({
    userId,
    flow,
  }));
}
