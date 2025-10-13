
/* ============================
   CONFIG - filled with your addresses
   ============================ */
const TOKEN_ADDRESS   = "0xE843Dfa0bF1eff7F55Af996E833cc1feD88F3c38";
const FAUCET_ADDRESS  = "0x9D33E22571bf7Cd53D95fa734830aF52Edf1c599";
const STAKING_ADDRESS = "0xC4C619B1a901Aa1000601F383cD9b7D705b404b1";

/* Binance perpetual symbol for MON (change if Binance updates) */
const BINANCE_SYMBOL = "MONUSDT";

/* CoinGecko IDs to show in grid (we'll fetch prices for these) */
const COINGECKO_IDS = [
  "bitcoin","ethereum","solana","sui","astar","render-token","ripple",
  "avalanche-2","cardano","dogecoin","polygon-pos","chainlink","polkadot","litecoin","tron"
];

/* friendly display names */
const NAME_MAP = {
  "bitcoin":"Bitcoin","ethereum":"Ethereum","solana":"Solana","sui":"Sui","astar":"Astar","render-token":"Render",
  "ripple":"XRP","avalanche-2":"Avalanche","cardano":"Cardano","dogecoin":"Dogecoin","polygon-pos":"Polygon",
  "chainlink":"Chainlink","polkadot":"Polkadot","litecoin":"Litecoin","tron":"Tron"
};

/* ============================
   ABIs
   ============================ */
const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address,uint256) returns (bool)",
  "function approve(address,uint256) returns (bool)",
  "function allowance(address,address) view returns (uint256)"
];

const FAUCET_ABI = [
  "function claim()",
  "function claimAmount() view returns (uint256)",
  "function claimed(address) view returns (bool)"
];

const STAKING_ABI = [
  "function stake(uint256)","function unstake(uint256)","function claim()",
  "function pendingRewards(address) view returns (uint256)",
  "function stakers(address) view returns (uint256,uint256,uint256)"
];

/* ============================
   App state + DOM refs
   ============================ */
let provider, signer, userAddr;
let tokenContract, faucetContract, stakingContract;
let decimals = 18;

const connectBtn = document.getElementById('connectBtn');
const addrEl = document.getElementById('addr');
const tokBalEl = document.getElementById('tokBal');
const stakedEl = document.getElementById('staked');
const pendingEl = document.getElementById('pending');
const claimBtn = document.getElementById('claimBtn');
const approveBtn = document.getElementById('approveBtn');
const stakeBtn = document.getElementById('stakeBtn');
const unstakeBtn = document.getElementById('unstakeBtn');
const claimRewardBtn = document.getElementById('claimRewardBtn');
const stakeInput = document.getElementById('stakeInput');
const priceEl = document.getElementById('monadPrice');
const changeEl = document.getElementById('monadChange');
const tokenGrid = document.getElementById('tokenGrid');

/* helper */
function shortAddress(addr){
  if(!addr) return 'Not connected';
  return addr.slice(0,6) + '...' + addr.slice(-4);
}
function pretty(n){ return Number(n).toLocaleString(undefined,{maximumFractionDigits:6}); }

/* build token grid (visual cards) */
function buildGrid(){
  tokenGrid.innerHTML='';
  for(const id of COINGECKO_IDS){
    const c = document.createElement('div'); c.className='token-card';
    c.innerHTML = `<div class="hover-fill"></div>
      <div style="position:relative;z-index:2;">
        <div class="name">${NAME_MAP[id]||id}</div>
        <div class="val" id="price-${id}">--</div>
        <div class="delta" id="chg-${id}">--</div>
      </div>`;
    c.addEventListener('mouseenter', ()=> c.classList.add('active'));
    c.addEventListener('mouseleave', ()=> c.classList.remove('active'));
    tokenGrid.appendChild(c);
  }
}
buildGrid();

/* ========== Particles ========== */
const canvas = document.getElementById('particles');
const ctx = canvas.getContext('2d');
let W = canvas.width = innerWidth, H = canvas.height = innerHeight;
window.addEventListener('resize', ()=>{ W = canvas.width = innerWidth; H = canvas.height = innerHeight; });

const particles = [];
for(let i=0;i<60;i++){
  particles.push({
    x: Math.random()*W, y: Math.random()*H,
    vx: (Math.random()*2-1)*0.12, vy:(Math.random()*2-1)*0.12,
    r: 6+Math.random()*18, hue: 250+Math.random()*40, alpha:0.04+Math.random()*0.07
  });
}
function tickParticles(){
  ctx.clearRect(0,0,W,H);
  for(const p of particles){
    p.x += p.vx; p.y += p.vy;
    if(p.x<-50) p.x=W+50; if(p.x>W+50) p.x=-50;
    if(p.y<-50) p.y=H+50; if(p.y>H+50) p.y=-50;
    const g = ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,p.r);
    g.addColorStop(0, `hsla(${p.hue},80%,60%,${p.alpha})`);
    g.addColorStop(1, `hsla(${p.hue},60%,40%,0)`);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fill();
  }
  requestAnimationFrame(tickParticles);
}
tickParticles();

window.addEventListener('mousemove', e=>{
  for(const p of particles){
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    const d = Math.sqrt(dx*dx+dy*dy);
    if(d<180){ p.vx += dx*0.0005; p.vy += dy*0.0005; }
    else { p.vx *= 0.995; p.vy *= 0.995; }
  }
});

/* ========== Price fetching ==========
   - MONAD perpetual via Binance FAPI (futures)
   - others via CoinGecko simple/price
=====================================*/
async function fetchMonadPrice(){
  try{
    const res = await fetch(`https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${BINANCE_SYMBOL}`);
    if(!res.ok) throw new Error('Binance API failed');
    const j = await res.json();
    const last = Number(j.lastPrice);
    const pct = Number(j.priceChangePercent);
    priceEl.innerText = last >= 1 ? `$${last.toLocaleString(undefined,{maximumFractionDigits:2})}` : `$${last.toFixed(6)}`;
    changeEl.innerText = `${pct>=0?'+':''}${pct.toFixed(2)}% (24h)`;
    changeEl.style.color = pct>=0? '#8ef0c3' : '#ff9b9b';
  }catch(e){
    console.warn('monad price err', e);
    priceEl.innerText = '$--';
    changeEl.innerText = '';
  }
}

async function fetchOtherPrices(){
  try{
    const ids = COINGECKO_IDS.join(',');
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`;
    const r = await fetch(url);
    const j = await r.json();
    for(const id of COINGECKO_IDS){
      const p = j[id] && j[id].usd !== undefined ? j[id].usd : null;
      const ch = j[id] && j[id].usd_24h_change !== undefined ? j[id].usd_24h_change : null;
      const pEl = document.getElementById(`price-${id}`);
      const chEl = document.getElementById(`chg-${id}`);
      if(pEl) pEl.textContent = p===null ? 'N/A' : (p>=1 ? `$${p.toLocaleString(undefined,{maximumFractionDigits:2})}` : `$${p.toFixed(6)}`);
      if(chEl) {
        if(ch===null) chEl.textContent=''; else {
          chEl.textContent = `${ch>=0?'+':''}${ch.toFixed(2)}% (24h)`;
          chEl.style.color = ch>=0 ? '#8ef0c3' : '#ff9b9b';
        }
      }
    }
  }catch(e){
    console.warn('coingecko err', e);
  }
}

/* refresh prices */
fetchMonadPrice();
fetchOtherPrices();
setInterval(fetchMonadPrice, 12000);
setInterval(fetchOtherPrices, 10000);

/* ========== Wallet & Contracts ========== */
async function refreshAll(){
  if(!tokenContract || !signer || !userAddr) return;
  try{
    const bal = await tokenContract.balanceOf(userAddr);
    let stAmt = 0;
    try{
      const s = await stakingContract.stakers(userAddr); // may be tuple
      stAmt = s && s[0] ? s[0] : 0;
    }catch(e){ stAmt = 0; }
    let pending = 0;
    try{ pending = await stakingContract.pendingRewards(userAddr); }catch(e){ pending = 0; }

    tokBalEl.innerText = pretty(Number(ethers.utils.formatUnits(bal, decimals)));
    stakedEl.innerText = pretty(Number(ethers.utils.formatUnits(stAmt, decimals)));
    pendingEl.innerText = pretty(Number(ethers.utils.formatUnits(pending, decimals)));
  }catch(e){ console.error('refresh error', e); }
}

async function initContracts(){
  provider = new ethers.providers.Web3Provider(window.ethereum);
  signer = provider.getSigner();
  userAddr = await signer.getAddress();
  addrEl.innerText = shortAddress(userAddr);
  tokenContract = new ethers.Contract(TOKEN_ADDRESS, ERC20_ABI, signer);
  faucetContract = new ethers.Contract(FAUCET_ADDRESS, FAUCET_ABI, signer);
  stakingContract = new ethers.Contract(STAKING_ADDRESS, STAKING_ABI, signer);
  try{ decimals = await tokenContract.decimals(); }catch(e){ decimals=18; }
  await refreshAll();
}

/* Connect wallet */
connectBtn.addEventListener('click', async ()=>{
  if(!window.ethereum) return alert('Please install MetaMask');
  try{
    await window.ethereum.request({ method: 'eth_requestAccounts' });
    await initContracts();
    setStatus('Wallet connected');
  }catch(e){ console.error(e); alert('Connect failed: '+(e.message||e)); }
});

/* helper status */
function setStatus(t){
  addrEl.innerText = t;
  setTimeout(()=>{ addrEl.innerText = shortAddress(userAddr) }, 2200);
}

/* Faucet claim */
claimBtn.addEventListener('click', async ()=>{
  if(!faucetContract) return alert('Connect wallet first');
  try{
    setStatus('Sending claim tx...');
    const tx = await faucetContract.claim();
    await tx.wait();
    setStatus('Claim successful!');
    await refreshAll();
  }catch(e){ console.error(e); alert('Claim failed: '+(e?.data?.message || e.message || e)); }
});

/* Approve (max) */
approveBtn.addEventListener('click', async ()=>{
  if(!tokenContract) return alert('Connect wallet first');
  try{
    const big = ethers.constants.MaxUint256;
    setStatus('Approving...');
    const tx = await tokenContract.approve(STAKING_ADDRESS, big);
    await tx.wait();
    setStatus('Approved');
  }catch(e){ console.error(e); alert('Approve failed: '+(e?.message||e)); }
});

/* Stake */
stakeBtn.addEventListener('click', async ()=>{
  if(!stakingContract) return alert('Connect wallet first');
  let v = stakeInput.value.trim();
  if(!v || isNaN(Number(v)) || Number(v)<=0) return alert('Enter valid amount');
  const amount = ethers.utils.parseUnits(v, decimals);
  try{
    setStatus('Staking...');
    const tx = await stakingContract.stake(amount);
    await tx.wait();
    setStatus('Staked!');
    await refreshAll();
  }catch(e){ console.error(e); alert('Stake failed: '+(e?.message||e)); }
});

/* Unstake */
unstakeBtn.addEventListener('click', async ()=>{
  if(!stakingContract) return alert('Connect wallet first');
  let v = prompt('Amount to unstake (tokens):', '0');
  if(!v) return;
  try{
    const amount = ethers.utils.parseUnits(v, decimals);
    setStatus('Unstaking...');
    const tx = await stakingContract.unstake(amount);
    await tx.wait();
    setStatus('Unstaked');
    await refreshAll();
  }catch(e){ console.error(e); alert('Unstake failed: '+(e?.message||e)); }
});

/* Claim rewards */
claimRewardBtn.addEventListener('click', async ()=>{
  if(!stakingContract) return alert('Connect wallet first');
  try{
    setStatus('Claiming rewards...');
    const tx = await stakingContract.claim();
    await tx.wait();
    setStatus('Rewards claimed');
    await refreshAll();
  }catch(e){ console.error(e); alert('Claim failed: '+(e?.message||e)); }
});

/* Auto refresh balances every 10s */
setInterval(()=>{ if(userAddr) refreshAll(); }, 10000);

/* Init if wallet already connected */
(async function onLoad(){
  if(window.ethereum){
    provider = new ethers.providers.Web3Provider(window.ethereum);
    try{
      const accts = await provider.listAccounts();
      if(accts && accts.length>0){
        signer = provider.getSigner();
        userAddr = await signer.getAddress();
        tokenContract = new ethers.Contract(TOKEN_ADDRESS, ERC20_ABI, signer);
        faucetContract = new ethers.Contract(FAUCET_ADDRESS, FAUCET_ABI, signer);
        stakingContract = new ethers.Contract(STAKING_ADDRESS, STAKING_ABI, signer);
        try{ decimals = await tokenContract.decimals(); }catch(e){ decimals=18; }
        addrEl.innerText = shortAddress(userAddr);
        await refreshAll();
      }
    }catch(e){}
  }
})();

