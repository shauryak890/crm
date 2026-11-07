// Hands bill lines from anywhere in the app (e.g. the Assistant's
// "Add to bill") to the POS. If the POS is open it picks them up at once;
// otherwise they wait here until it mounts.
const queue = [];
export const BILL_EVENT = "wb:bill-queue";

export function sendToBill(lines) {
  queue.push(...lines);
  window.dispatchEvent(new Event(BILL_EVENT));
}

export function drainBill() {
  return queue.splice(0, queue.length);
}
