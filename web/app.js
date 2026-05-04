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
  bytecode: null,
  quickAccounts: [],
};

const el = {
  connectionMode: document.getElementById("connectionMode"),
  rpcUrl: document.getElementById("rpcUrl"),
  privateKey: document.getElementById("privateKey"),
  loginAccountSelect: document.getElementById("loginAccountSelect"),
  contractAddress: document.getElementById("contractAddress"),
  connectBtn: document.getElementById("connectBtn"),
  deployBtn: document.getElementById("deployBtn"),
  loadBtn: document.getElementById("loadBtn"),
  walletStatus: document.getElementById("walletStatus"),
  roleStatus: document.getElementById("roleStatus"),
  batchAssignments: document.getElementById("batchAssignments"),
  assignBatchBtn: document.getElementById("assignBatchBtn"),
  assignDefaultBtn: document.getElementById("assignDefaultBtn"),
  regProductId: document.getElementById("regProductId"),
  regMetadata: document.getElementById("regMetadata"),
  registerBtn: document.getElementById("registerBtn"),
  txProductId: document.getElementById("txProductId"),
  txToAccountSelect: document.getElementById("txToAccountSelect"),
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
  state.bytecode = json.bytecode;
  return state.abi;
}

async function loadArtifact() {
  if (state.abi && state.bytecode) return { abi: state.abi, bytecode: state.bytecode };
  await loadAbi();
  if (!state.bytecode) throw new Error("Bytecode missing in artifact.");
  return { abi: state.abi, bytecode: state.bytecode };
}

function short(address) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function getHardhatQuickAccounts() {
  const mnemonic = "test test test test test test test test test test test junk";
  const accounts = [];
  for (let i = 0; i < 20; i += 1) {
    const path = `m/44'/60'/0'/0/${i}`;
    const wallet = ethers.HDNodeWallet.fromPhrase(mnemonic, undefined, path);
    accounts.push({
      label: `account${i}`,
      index: i,
      address: wallet.address,
      privateKey: wallet.privateKey,
    });
  }
  return accounts;
}

function renderQuickAccountSelects() {
  const defaultRoleByIndex = {
    1: "Producer",
    2: "Logistics",
    3: "Warehouse",
    4: "Retailer",
    5: "Consumer",
    6: "Regulator",
  };

  state.quickAccounts = getHardhatQuickAccounts();
  for (const account of state.quickAccounts) {
    const defaultRole = defaultRoleByIndex[account.index];
    const roleSuffix = defaultRole ? ` [default: ${defaultRole}]` : "";

    const loginOpt = document.createElement("option");
    loginOpt.value = String(account.index);
    loginOpt.textContent = `${account.label}${roleSuffix} (${short(account.address)})`;
    el.loginAccountSelect.appendChild(loginOpt);

    const toOpt = document.createElement("option");
    toOpt.value = String(account.index);
    toOpt.textContent = `${account.label}${roleSuffix} (${short(account.address)})`;
    el.txToAccountSelect.appendChild(toOpt);
  }
}

function updateConnectionModeUi() {
  const isRpcMode = el.connectionMode.value === "rpc";
  el.rpcUrl.disabled = !isRpcMode;
  el.privateKey.disabled = !isRpcMode;
  el.loginAccountSelect.disabled = !isRpcMode;
}

function parseRoleValue(rawValue) {
  const value = rawValue.trim();
  if (!value) throw new Error("Role is empty.");

  if (/^\d+$/.test(value)) {
    const role = Number(value);
    if (role < 1 || role >= ROLE_NAMES.length) {
      throw new Error(`Invalid role number: ${value}`);
    }
    return role;
  }

  const idx = ROLE_NAMES.findIndex((name) => name.toLowerCase() === value.toLowerCase());
  if (idx <= 0) throw new Error(`Invalid role name: ${value}`);
  return idx;
}

function parseBatchAssignments(inputText) {
  const lines = inputText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));

  if (lines.length === 0) throw new Error("No assignments provided.");

  return lines.map((line, index) => {
    const parts = line.split(",").map((part) => part.trim());
    if (parts.length !== 2) {
      throw new Error(`Line ${index + 1}: expected format address,role`);
    }

    const [address, roleRaw] = parts;
    if (!ethers.isAddress(address)) {
      throw new Error(`Line ${index + 1}: invalid address ${address}`);
    }

    const role = parseRoleValue(roleRaw);
    return { address, role, lineNumber: index + 1 };
  });
}

async function refreshRole() {
  if (!state.contract || !state.account) return;
  const role = Number(await state.contract.getRole(state.account));
  el.roleStatus.textContent = `Role: ${ROLE_NAMES[role] ?? "Unknown"} (${role})`;
}

async function connectWallet() {
  const mode = el.connectionMode.value;

  if (mode === "metamask") {
    if (!window.ethereum) throw new Error("MetaMask not found.");
    state.provider = new ethers.BrowserProvider(window.ethereum);
    await state.provider.send("eth_requestAccounts", []);
    state.signer = await state.provider.getSigner();
  } else {
    const rpcUrl = el.rpcUrl.value.trim();
    const privateKey = el.privateKey.value.trim();
    if (!rpcUrl) throw new Error("RPC URL is required for RPC mode.");
    if (!privateKey) throw new Error("Private key is required for RPC mode.");

    state.provider = new ethers.JsonRpcProvider(rpcUrl);
    state.signer = new ethers.Wallet(privateKey, state.provider);
  }

  state.account = await state.signer.getAddress();
  const label = mode === "metamask" ? "MetaMask" : "RPC wallet";
  el.walletStatus.textContent = `Wallet: ${short(state.account)} via ${label}`;
  log(`Connected ${label} ${state.account}`);
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

async function deployContract() {
  if (!state.signer) throw new Error("Connect wallet first.");
  const { abi, bytecode } = await loadArtifact();
  const factory = new ethers.ContractFactory(abi, bytecode, state.signer);
  const contract = await factory.deploy();
  log(`deploy submitted: ${contract.deploymentTransaction().hash}`);
  await contract.waitForDeployment();
  const deployedAddress = await contract.getAddress();
  el.contractAddress.value = deployedAddress;
  log(`deploy confirmed: ${deployedAddress}`);
  await loadContract();
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

async function assignRolesBatch() {
  const assignments = parseBatchAssignments(el.batchAssignments.value);
  log(`Batch role assignment started: ${assignments.length} entries`);

  for (const item of assignments) {
    log(`Assigning line ${item.lineNumber}: ${item.address} -> ${ROLE_NAMES[item.role]} (${item.role})`);
    await sendTx(
      state.contract.assignRole(item.address, item.role),
      `assignRole line ${item.lineNumber}`
    );
  }

  log("Batch role assignment completed.");
}

async function assignDefaultRoles() {
  if (!state.provider) throw new Error("Connect wallet first.");
  const accounts = await state.provider.send("eth_accounts", []);
  if (!Array.isArray(accounts) || accounts.length < 7) {
    throw new Error("Need at least 7 unlocked accounts on this RPC (owner + 6 participants).");
  }

  const defaults = [
    { address: accounts[1], role: 1, label: "Producer" },
    { address: accounts[2], role: 2, label: "Logistics" },
    { address: accounts[3], role: 3, label: "Warehouse" },
    { address: accounts[4], role: 4, label: "Retailer" },
    { address: accounts[5], role: 5, label: "Consumer" },
    { address: accounts[6], role: 7, label: "Regulator" },
  ];

  log("Assigning default roles to accounts #1-#6...");
  for (const item of defaults) {
    log(`Assigning ${item.label}: ${item.address}`);
    await sendTx(state.contract.assignRole(item.address, item.role), `assignRole ${item.label}`);
  }
  log("Default role assignment completed.");
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

function onLoginAccountSelected() {
  const raw = el.loginAccountSelect.value;
  if (!raw) return;
  const idx = Number(raw);
  const account = state.quickAccounts[idx];
  if (!account) return;
  el.privateKey.value = account.privateKey;
  if (!el.rpcUrl.value.trim()) el.rpcUrl.value = "http://127.0.0.1:8545";
  log(`Selected ${account.label} for RPC login: ${account.address}`);
}

function onTxToAccountSelected() {
  const raw = el.txToAccountSelect.value;
  if (!raw) return;
  const idx = Number(raw);
  const account = state.quickAccounts[idx];
  if (!account) return;
  el.txTo.value = account.address;
  log(`Transfer receiver set to ${account.label}: ${account.address}`);
}

function wireActions() {
  el.connectionMode.addEventListener("change", updateConnectionModeUi);
  el.loginAccountSelect.addEventListener("change", onLoginAccountSelected);
  el.txToAccountSelect.addEventListener("change", onTxToAccountSelected);
  el.connectBtn.addEventListener("click", () => withError(connectWallet));
  el.deployBtn.addEventListener("click", () => withError(deployContract));
  el.loadBtn.addEventListener("click", () => withError(loadContract));
  el.assignBatchBtn.addEventListener("click", () => withError(assignRolesBatch));
  el.assignDefaultBtn.addEventListener("click", () => withError(assignDefaultRoles));
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

renderQuickAccountSelects();
renderStatusOptions();
updateConnectionModeUi();
wireActions();
log("UI loaded. Connect wallet to begin.");
