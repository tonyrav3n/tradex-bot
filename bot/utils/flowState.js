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
    priceUsd: null,
    buyerAgreed: false,
    sellerAgreed: false,
    buyerAddress: null,
    sellerAddress: null,
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

export function setPrice(userId, priceUsd) {
  return setFlow(userId, { priceUsd });
}

export function markBuyerAgreed(userId) {
  return setFlow(userId, { buyerAgreed: true });
}

export function markSellerAgreed(userId) {
  return setFlow(userId, { sellerAgreed: true });
}

export function setBuyerAddress(userId, address) {
  return setFlow(userId, { buyerAddress: address });
}

export function setSellerAddress(userId, address) {
  return setFlow(userId, { sellerAddress: address });
}
