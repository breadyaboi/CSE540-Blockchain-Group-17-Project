const ROLE_NAMES = ["None", "Producer", "Logistics", "Warehouse", "Retailer", "Consumer", "SystemAdmin", "Regulator", "Auditor"];
const STATUS_NAMES = [
  "None", "Created", "Packed", "InTransit", "Stored", "AtRetail",
  "Sold", "Verified", "Returned", "Recalled", "Damaged", "Expired", "Lost",
];

const state = {
  provider: null,
  signer: null,
  account: null,
  contract: null,
  abi: null,
};

const el = {
  contractAddress: document.getElementById("contractAddress"),
  connectBtn: document.getElementById("connectBtn"),
  loadBtn: document.getElementById("loadBtn"),
  walletStatus: document.getElementById("walletStatus"),
  roleStatus: document.getElementById("roleStatus"),
  regProductId: document.getElementById("regProductId"),
  regMetadata: document.getElementById("regMetadata"),
  registerBtn: document.getElementById("registerBtn"),
  txProductId: document.getElementById("txProductId"),
  txTo: document.getElementById("txTo"),
  txMeta: document.getElementById("txMeta"),
  transferBtn: document.getElementById("transferBtn"),
  stProductId: document.getElementById("stProductId"),
  stStatus: document.getElementById("stStatus"),
  stMeta: document.getElementById("stMeta"),
  statusBtn: document.getElementById("statusBtn"),
  vfProductId: document.getElementById("vfProductId"),
  vfMeta: document.getElementById("vfMeta"),
  verifyBtn: document.getElementById("verifyBtn"),
  queryProductId: document.getElementById("queryProductId"),
  queryBtn: document.getElementById("queryBtn"),
  productView: document.getElementById("productView"),
  historyView: document.getElementById("historyView"),
  logView: document.getElementById("logView"),
};

function log(message) {
  const time = new Date().toISOString();
  el.logView.textContent = `[${time}] ${message}\n${el.logView.textContent}`;
}

function toBigInt(value) {
  return BigInt(String(value).trim());
}

async function loadAbi() {
  if (state.abi) return state.abi;
  const res = await fetch("/artifacts/contracts/SupplyChainProvenance.sol/SupplyChainProvenance.json");
  if (!res.ok) throw new Error("Cannot load ABI artifact. Run `npx hardhat compile` first.");
  const json = await res.json();
  state.abi = json.abi;
  return state.abi;
}

function short(address) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

async function refreshRole() {
  if (!state.contract || !state.account) return;
  const role = Number(await state.contract.getRole(state.account));
  el.roleStatus.textContent = `Role: ${ROLE_NAMES[role] ?? "Unknown"} (${role})`;
}

async function connectWallet() {
  if (!window.ethereum) throw new Error("MetaMask not found.");
  state.provider = new ethers.BrowserProvider(window.ethereum);
  await state.provider.send("eth_requestAccounts", []);
  state.signer = await state.provider.getSigner();
  state.account = await state.signer.getAddress();
  el.walletStatus.textContent = `Wallet: ${short(state.account)}`;
  log(`Connected wallet ${state.account}`);
}

async function loadContract() {
  if (!state.signer) throw new Error("Connect wallet first.");
  const address = el.contractAddress.value.trim();
  if (!ethers.isAddress(address)) throw new Error("Invalid contract address.");
  const abi = await loadAbi();
  state.contract = new ethers.Contract(address, abi, state.signer);
  await refreshRole();
  log(`Loaded contract ${address}`);
}

function renderStatusOptions() {
  for (let i = 1; i < STATUS_NAMES.length; i += 1) {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = `${STATUS_NAMES[i]} (${i})`;
    el.stStatus.appendChild(opt);
  }
}

async function sendTx(txPromise, label) {
  const tx = await txPromise;
  log(`${label} submitted: ${tx.hash}`);
  const receipt = await tx.wait();
  log(`${label} confirmed in block ${receipt.blockNumber}`);
}

async function registerProduct() {
  await sendTx(
    state.contract.registerProduct(toBigInt(el.regProductId.value), el.regMetadata.value.trim()),
    "registerProduct"
  );
}

async function transferCustody() {
  await sendTx(
    state.contract.transferCustody(
      toBigInt(el.txProductId.value),
      el.txTo.value.trim(),
      el.txMeta.value.trim()
    ),
    "transferCustody"
  );
}

async function updateStatus() {
  await sendTx(
    state.contract.updateStatus(
      toBigInt(el.stProductId.value),
      Number(el.stStatus.value),
      el.stMeta.value.trim()
    ),
    "updateStatus"
  );
}

async function verifyProduct() {
  await sendTx(
    state.contract.verifyProduct(toBigInt(el.vfProductId.value), el.vfMeta.value.trim()),
    "verifyProduct"
  );
}

async function loadProductAndHistory() {
  const productId = toBigInt(el.queryProductId.value);
  const p = await state.contract.getProduct(productId);
  el.productView.textContent = JSON.stringify(
    {
      productId: p.productId.toString(),
      metadataHash: p.metadataHash,
      currentCustodian: p.currentCustodian,
      status: `${STATUS_NAMES[Number(p.status)]} (${Number(p.status)})`,
      exists: p.exists,
    },
    null,
    2
  );

  const history = await state.contract.getProvenanceHistory(productId);
  el.historyView.textContent = JSON.stringify(
    history.map((h) => ({
      timestamp: Number(h.timestamp),
      isoTime: new Date(Number(h.timestamp) * 1000).toISOString(),
      actor: h.actor,
      action: h.action,
      eventMetadata: h.eventMetadata,
    })),
    null,
    2
  );

  log(`Loaded product ${productId.toString()} and ${history.length} history records`);
}

function wireActions() {
  el.connectBtn.addEventListener("click", () => withError(connectWallet));
  el.loadBtn.addEventListener("click", () => withError(loadContract));
  el.registerBtn.addEventListener("click", () => withError(registerProduct));
  el.transferBtn.addEventListener("click", () => withError(transferCustody));
  el.statusBtn.addEventListener("click", () => withError(updateStatus));
  el.verifyBtn.addEventListener("click", () => withError(verifyProduct));
  el.queryBtn.addEventListener("click", () => withError(loadProductAndHistory));
}

async function withError(fn) {
  try {
    if (!state.contract && fn !== connectWallet && fn !== loadContract) {
      throw new Error("Connect wallet and load contract first.");
    }
    await fn();
    await refreshRole();
  } catch (error) {
    log(`Error: ${error?.reason ?? error?.shortMessage ?? error?.message ?? String(error)}`);
  }
}

renderStatusOptions();
wireActions();
log("UI loaded. Connect wallet to begin.");
