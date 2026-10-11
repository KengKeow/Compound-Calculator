/* COMPOUND. Personal Finance Studio
 * Vanilla JavaScript; works entirely offline. No frameworks, analytics or APIs.
 * Illustration only: a fixed nominal rate and a simplified 365-day financial year.
 */
(() => {
  'use strict';

  const STORAGE_KEY = 'compound-studio-settings-v1';
  const DEFAULTS = Object.freeze({
    currency: 'MYR', initial: 10000, interestRate: 5, ratePeriod: 'yearly',
    compound: '12', customCompound: 24, years: 20, months: 0,
    flow: 'deposits', deposit: 500, depositFreq: 'monthly', depositTiming: 'end',
    depositIncrease: 0, depositIncreaseType: 'percent',
    withdrawal: 250, withdrawalFreq: 'monthly', withdrawalTiming: 'end',
    withdrawalIncrease: 0, goal: 250000, inflation: 2.5
  });
  const NUMERIC_KEYS = new Set(['initial','interestRate','customCompound','years','months','deposit','depositIncrease','withdrawal','withdrawalIncrease','goal','inflation']);
  const CURRENCIES = { MYR:'RM', USD:'$', SGD:'S$', EUR:'€', GBP:'£', JPY:'¥', INR:'₹' };
  const MONTH_DAYS = [31,28,31,30,31,30,31,31,30,31,30,31];
  const REGULAR_FREQUENCIES = {monthly:1, quarterly:3, 'half-yearly':6, yearly:12};

  const $ = id => document.getElementById(id);
  const form = $('calculatorForm');
  let currentSettings = {...DEFAULTS};
  let currentResult = null;
  let chartView = 'nominal';
  let tableView = 'yearly';
  let hoveredIndex = -1;
  let chartLayout = null;
  let toastTimer = null;
  let queued = false;
  let changedFromInput = false;

  function money(number, decimals=2) {
    const symbol = CURRENCIES[currentSettings.currency] || 'RM';
    const val = Number.isFinite(number) ? number : 0;
    const str = Math.abs(val).toLocaleString('en-MY', {minimumFractionDigits:decimals, maximumFractionDigits:decimals});
    return `${val < -0.000001 ? '−' : ''}${symbol} ${str}`;
  }
  function compact(value) {
    const n = Math.abs(value);
    const prefix = value < 0 ? '−' : '';
    const unit = n >= 1e12 ? 'T' : n >= 1e9 ? 'B' : n >= 1e6 ? 'M' : n >= 1e3 ? 'k' : '';
    const factor = n >= 1e12 ? 1e12 : n >= 1e9 ? 1e9 : n >= 1e6 ? 1e6 : n >= 1e3 ? 1e3 : 1;
    return `${prefix}${(n / factor).toLocaleString('en-MY', {maximumFractionDigits: n/factor < 10 ? 1 : 0})}${unit}`;
  }
  function moneyCompact(value) { return `${CURRENCIES[currentSettings.currency] || 'RM'} ${compact(value)}`; }
  function percent(value) { return `${Number.isFinite(value) ? value.toLocaleString('en-MY',{minimumFractionDigits:2,maximumFractionDigits:2}) : '—'}%`; }
  function setText(id, value) { $(id).textContent = value; }
  function showToast(message) {
    const toast = $('toast'); toast.textContent = message; toast.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
  }

  function readSettings() {
    const out = {};
    for (const key of Object.keys(DEFAULTS)) {
      const el = $(key);
      if (!el) continue;
      out[key] = NUMERIC_KEYS.has(key) ? (el.value.trim() === '' ? NaN : Number(el.value)) : el.value;
    }
    return out;
  }
  function applySettings(settings) {
    const clean = {...DEFAULTS};
    for (const [key, defaultValue] of Object.entries(DEFAULTS)) {
      const value = settings[key];
      if (NUMERIC_KEYS.has(key)) {
        if (typeof value === 'number' && Number.isFinite(value)) clean[key] = value;
      } else if (typeof value === 'string') {
        const select = $(key);
        if (key === 'flow') { if (['none','deposits','withdrawals','both'].includes(value)) clean[key] = value; }
        else if (select && [...select.options].some(option => option.value === value)) clean[key] = value;
      }
    }
    for (const [key, value] of Object.entries(clean)) if ($(key)) $(key).value = String(value);
    updateFlowTabs(); updateVisibility();
  }
  function updateFlowTabs() {
    const mode = $('flow').value;
    document.querySelectorAll('[data-flow]').forEach(button => {
      const active = button.dataset.flow === mode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }
  function updateVisibility() {
    const flow = $('flow').value;
    $('depositFields').hidden = flow !== 'deposits' && flow !== 'both';
    $('withdrawalFields').hidden = flow !== 'withdrawals' && flow !== 'both';
    $('customWrap').hidden = $('compound').value !== 'custom';
    const symbol = CURRENCIES[$('currency').value] || 'RM';
    document.querySelectorAll('[data-currency-symbol]').forEach(el => { el.textContent = symbol; });
  }
  function validationError(s) {
    for (const k of NUMERIC_KEYS) if (!Number.isFinite(s[k])) return 'Please fill in all numeric fields with valid numbers.';
    if (s.initial < 0 || s.deposit < 0 || s.withdrawal < 0 || s.goal < 0) return 'Balances and transaction amounts cannot be negative.';
    if (s.initial > 1e12 || s.deposit > 1e12 || s.withdrawal > 1e12 || s.goal > 1e12) return 'Please keep each entered amount at or below one trillion.';
    if (!Number.isInteger(s.years) || !Number.isInteger(s.months) || s.years < 0 || s.months < 0 || s.months > 11 || s.years*12+s.months > 720 || s.years*12+s.months < 1) return 'Choose a duration from 1 month to 60 years (0–11 extra months).';
    if (!Number.isInteger(s.customCompound) || s.customCompound < 1 || s.customCompound > 365) return 'Custom compounding must be a whole number between 1 and 365.';
    if (s.interestRate < -90 || s.interestRate > 100) return 'Please enter an interest rate between −90% and 100%.';
    if (s.depositIncrease < -100 || s.depositIncrease > 1e12 || s.withdrawalIncrease < -100 || s.withdrawalIncrease > 1000) return 'Check your annual increase values.';
    if (s.inflation <= -100 || s.inflation > 100) return 'Enter an inflation rate greater than −100% and no more than 100%.';
    const n = compoundCount(s);
    if (1 + annualRate(s) / n <= 0) return 'The selected negative interest rate is too large for this compounding frequency.';
    return '';
  }
  function annualRate(s) { return (s.interestRate / 100) * (s.ratePeriod === 'monthly' ? 12 : 1); }
  function compoundCount(s) { return s.compound === 'custom' ? s.customCompound : Number(s.compound); }
  function frequencyEvent(freq, timing, dayIndex, monthIndex, dayInMonth, daysInMonth) {
    if (freq === 'daily') return true;
    if (freq === 'weekly' || freq === 'fortnightly') {
      const span = freq === 'weekly' ? 7 : 14;
      return timing === 'beginning' ? dayIndex % span === 0 : (dayIndex + 1) % span === 0;
    }
    const span = REGULAR_FREQUENCIES[freq];
    if (!span) return false;
    return timing === 'beginning'
      ? monthIndex % span === 0 && dayInMonth === 0
      : (monthIndex + 1) % span === 0 && dayInMonth === daysInMonth - 1;
  }
  function amountInYear(original, change, type, yearIndex) {
    if (type === 'amount') return Math.max(0, original + change * yearIndex);
    return Math.max(0, original * Math.pow(Math.max(0, 1 + change / 100), yearIndex));
  }
  function compoundSchedule(n, rate) {
    const starts = [0];
    if ([1,2,4,12].includes(n)) {
      const everyMonths = 12 / n;
      let day = 0;
      for (let m=0; m<12; m++) {
        day += MONTH_DAYS[m];
        if ((m+1)%everyMonths === 0) starts.push(day);
      }
    } else {
      for (let k=1; k<=n; k++) starts.push(Math.round(365 * k / n));
    }
    const dailyRates = new Float64Array(365), isEnd = new Uint8Array(365);
    for (let k=0; k<n; k++) {
      const start = starts[k], end = starts[k+1], perDay = (rate / n) / (end - start);
      for (let day=start; day<end; day++) dailyRates[day] = perDay;
      isEnd[end - 1] = 1;
    }
    return { dailyRates, isEnd };
  }

  /*
    Daily event simulation, 365-day financial year.
    Interest is ACCRUED daily on the current credited balance and CREDITED only at
    selected compounding boundaries. Thus monthly compounding without flows matches
    P * (1 + r/12)^(12 * years) exactly. Events at period end occur after the day's
    interest credit; events at period beginning occur before daily accrual.
    If the money runs out, withdrawals are capped at available cash (no debt).
    The terminal value excludes interest not yet credited in an incomplete period.
  */
  function simulate(s, override={}) {
    const months = s.years * 12 + s.months;
    const n = compoundCount(s);
    const rate = override.rate == null ? annualRate(s) : override.rate;
    const schedule = compoundSchedule(n, rate);
    const flow = override.flow == null ? s.flow : override.flow;
    let balance = s.initial, earned = 0, accrued = 0, deposited = 0, withdrawn = 0;
    let globalDay = 0;
    const monthly = [{index:0, balance, deposited:0, withdrawn:0, earned:0,
      totalDeposited:0, totalWithdrawn:0, totalEarned:0, netInvested:s.initial, pending:0}];
    let underfunded = false;

    for (let m=0; m<months; m++) {
      const monthOfYear = m % 12;
      const yearIndex = Math.floor(m / 12);
      const days = MONTH_DAYS[monthOfYear];
      let monthDeposit=0, monthWithdrawal=0, monthInterest=0;
      const hasDeposits = flow === 'deposits' || flow === 'both';
      const hasWithdrawals = flow === 'withdrawals' || flow === 'both';
      const depositAmount = amountInYear(s.deposit, s.depositIncrease, s.depositIncreaseType, yearIndex);
      const withdrawalAmount = amountInYear(s.withdrawal, s.withdrawalIncrease, 'percent', yearIndex);
      const transact = type => {
        if (type === 'deposit' && hasDeposits && depositAmount > 0) {
          balance += depositAmount; deposited += depositAmount; monthDeposit += depositAmount;
        } else if (type === 'withdrawal' && hasWithdrawals && withdrawalAmount > 0) {
          const actual = Math.min(Math.max(0, balance), withdrawalAmount);
          if (actual + 0.0000001 < withdrawalAmount) underfunded = true;
          balance -= actual; withdrawn += actual; monthWithdrawal += actual;
        }
      };
      for (let d=0; d<days; d++) {
        const depToday = hasDeposits && frequencyEvent(s.depositFreq,s.depositTiming,globalDay,m,d,days);
        const withdrawToday = hasWithdrawals && frequencyEvent(s.withdrawalFreq,s.withdrawalTiming,globalDay,m,d,days);
        // Deposit then withdraw, so same-day cash additions are immediately available.
        if (depToday && s.depositTiming === 'beginning') transact('deposit');
        if (withdrawToday && s.withdrawalTiming === 'beginning') transact('withdrawal');
        const yearDay = globalDay % 365;
        accrued += balance * schedule.dailyRates[yearDay];
        if (schedule.isEnd[yearDay]) {
          balance += accrued; earned += accrued; monthInterest += accrued; accrued = 0;
          if (balance < 0) balance = 0;
        }
        if (depToday && s.depositTiming === 'end') transact('deposit');
        if (withdrawToday && s.withdrawalTiming === 'end') transact('withdrawal');
        globalDay++;
      }
      monthly.push({index:m+1, balance, deposited:monthDeposit, withdrawn:monthWithdrawal,
        earned:monthInterest,totalDeposited:deposited,totalWithdrawn:withdrawn,
        totalEarned:earned, netInvested:s.initial+deposited-withdrawn, pending:accrued});
    }
    const yearly = [monthly[0]];
    for (let end=12; end<=months; end+=12) yearly.push(aggregateYear(monthly, end, Math.max(0,end-12)));
    if (months%12 !== 0) yearly.push(aggregateYear(monthly,months,Math.floor(months/12)*12));
    return {monthly, yearly, balance, earned, deposited, withdrawn,
      netInvested:s.initial+deposited-withdrawn, underfunded, uncredited:accrued};
  }
  function aggregateYear(monthly, end, beginning) {
    let deposited=0,withdrawn=0,earned=0;
    for (let k=beginning+1;k<=end;k++) {
      deposited += monthly[k].deposited;
      withdrawn += monthly[k].withdrawn;
      earned += monthly[k].earned;
    }
    return {...monthly[end], index:Math.ceil(end/12), monthIndex:end, deposited, withdrawn, earned};
  }

  function calculate(s) {
    const main=simulate(s), noContrib=simulate(s,{flow:'none'});
    const months=s.years*12+s.months;
    const inflationFactor=m => Math.pow(1+s.inflation/100,m/12);
    const goalRow= s.goal > 0 ? main.monthly.find(p=>p.balance >= s.goal) : null;
    const realGoalRow= s.goal > 0 ? main.monthly.find(p=>p.balance / inflationFactor(p.index) >= s.goal) : null;
    return { ...main, noContrib, months, inflationFactor, goalRow, realGoalRow,
      apy:(Math.pow(1+annualRate(s)/compoundCount(s),compoundCount(s))-1)*100 };
  }

  function renderStats(s,r) {
    setText('durationLabel',s.years ? `${s.years}Y ${s.months ? `${s.months}M ` : ''}PROJECTION` : `${s.months}-MONTH PROJECTION`);
    setText('finalBalance',money(r.balance));
    setText('interestEarned',money(r.earned));
    setText('totalDeposits',money(r.deposited));
    setText('totalWithdrawn',money(r.withdrawn));
    const gain = r.netInvested > 0 ? (r.balance/r.netInvested-1)*100 : null;
    setText('balanceGrowth',gain === null ? 'N/A' : `${gain>=0?'+':''}${gain.toFixed(1)}%`);
    setText('interestNote',Math.abs(r.uncredited) > 0.001 ? `${money(r.uncredited)} accrued, not yet credited` : 'Interest credited to balance');
    setText('depositNote',`Opening balance: ${money(s.initial)}`);
    setText('withdrawalNote',r.underfunded ? 'Some requested withdrawals were capped' : 'Withdrawn cash is excluded from balance');
    setText('apyValue',percent(r.apy));
    const cashPaidIn=s.initial+r.deposited;
    setText('roiValue',cashPaidIn>0?percent(100*r.earned/cashPaidIn):'—');
    setText('netInvested',money(r.netInvested));
    setText('realValue',money(r.balance/r.inflationFactor(r.months)));
    const n=compoundCount(s), rate=annualRate(s);
    const doubleMonths=rate>0 ? Math.ceil(12*Math.log(2)/(n*Math.log(1+rate/n))) : null;
    setText('doublingTime',doubleMonths===null?'Not at this rate':describeMonth(doubleMonths));
    renderGoal(s,r);
  }
  function describeMonth(monthIndex) {
    if (monthIndex === 0) return 'Already reached';
    const y=Math.floor(monthIndex/12),m=monthIndex%12;
    return `${y?`${y}y `:''}${m?`${m}m`:''}`.trim() || '—';
  }
  function renderGoal(s,r) {
    const isReal=chartView==='real';
    const current=isReal?r.balance/r.inflationFactor(r.months):r.balance;
    const progress=s.goal>0?Math.max(0,100*current/s.goal):0;
    const reached=isReal?r.realGoalRow:r.goalRow;
    setText('goalAmount',money(s.goal,0));
    setText('goalPercent',s.goal ? `${Math.min(progress,9999).toFixed(1)}% of goal` : 'Add a goal to track progress');
    setText('goalWhen',reached ? describeMonth(reached.index) : 'Not in this period');
    const status=s.goal===0?'Not set':reached?'Reached':'In progress';
    setText('goalStatus',status);
    $('goalBar').setAttribute('aria-valuenow',String(Math.min(100,Math.round(progress))));
    $('goalProgress').style.width=`${Math.min(100,progress)}%`;
    const context=isReal ? "in today's purchasing power" : 'in future nominal money';
    setText('goalMessage',s.goal===0?'Enter a savings goal to estimate your milestone.': reached?
      `Projected to reach your goal after ${describeMonth(reached.index).toLowerCase()}, ${context}.`:
      `The target is not reached within the selected horizon, ${context}.`);
  }
  function renderTable(r) {
    const rows=tableView==='yearly'?r.yearly:r.monthly;
    const tbody=$('resultsTable');
    const fragment=document.createDocumentFragment();
    for (const row of rows) {
      const tr=document.createElement('tr');
      if(row.index===0)tr.classList.add('initial-row');
      const cells=[row.index===0?'Start':tableView==='yearly'?`Year ${row.index}${row.monthIndex&&row.monthIndex%12?' *':''}`:`Month ${row.index}`,
        money(row.index===0?0:row.deposited), money(row.index===0?0:row.withdrawn),
        money(row.earned),money(row.netInvested),money(row.balance)];
      for(const content of cells){const td=document.createElement('td');td.textContent=content;tr.appendChild(td);}
      fragment.appendChild(tr);
    }
    tbody.replaceChildren(fragment);
    setText('periodHead',tableView==='yearly'?'Year':'Month');
    setText('tableCount',`Showing ${rows.length-1} ${tableView==='yearly'?'yearly':'monthly'} periods${tableView==='yearly'&&r.months%12?' (* final partial year)':''}`);
  }
  function setSegmented(groupId, attr, value) {
    $(groupId).querySelectorAll('button').forEach(button=>{
      const active=button.dataset[attr]===value;
      button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));
    });
  }

  // Entire chart uses native Canvas. There is no external chart-library CDN dependency.
  function drawChart() {
    if(!currentResult)return;
    const r=currentResult, s=currentSettings;
    const canvas=$('growthChart'), area=$('chartArea');
    const box=area.getBoundingClientRect();
    if(box.width<100||box.height<100)return;
    const ratio=Math.max(1,Math.min(3,window.devicePixelRatio||1));
    canvas.width=Math.round(box.width*ratio);canvas.height=Math.round(box.height*ratio);
    const ctx=canvas.getContext('2d');if(!ctx)return;
    ctx.setTransform(ratio,0,0,ratio,0,0);
    const W=box.width,H=box.height;
    ctx.fillStyle='#121315';ctx.fillRect(0,0,W,H);
    const margin={left:W<450?59:77,right:13,top:20,bottom:40};
    const graphW=W-margin.left-margin.right,graphH=H-margin.top-margin.bottom;
    const scale=month=>chartView==='real'?r.inflationFactor(month):1;
    const main=r.monthly.map(p=>p.balance/scale(p.index));
    const paid=r.monthly.map(p=>p.netInvested/scale(p.index));
    const flat=r.noContrib.monthly.map(p=>p.balance/scale(p.index));
    let min=Math.min(0,...main,...paid,...flat),max=Math.max(0,...main,...paid,...flat);
    const goal=s.goal;
    const showGoal=goal>0 && (goal<=max*1.12||max===0) && (goal>=min*1.12 || min===0);
    if(showGoal)max=Math.max(goal,max);
    if(max<=min){max=min+100;}
    const range=max-min;
    const pad=range*0.1;
    max+=pad;min-=pad*0.35;
    const x=i=>margin.left+graphW*i/r.months;
    const y=v=>margin.top+graphH*(max-v)/(max-min);
    chartLayout={x,y,main,paid,flat,graphW,margin,W,H};
    ctx.lineWidth=1;ctx.font='10px Inter, system-ui, sans-serif';ctx.textBaseline='middle';ctx.textAlign='right';
    for(let i=0;i<=4;i++){
      const val=min+(max-min)*(4-i)/4,yy=y(val);
      ctx.strokeStyle='#2b2c2f';ctx.setLineDash([3,5]);ctx.beginPath();ctx.moveTo(margin.left,yy);ctx.lineTo(W-margin.right,yy);ctx.stroke();
      ctx.fillStyle='#898a8d';ctx.fillText(compact(val),margin.left-11,yy);
    }
    ctx.setLineDash([]);
    ctx.textAlign='center';ctx.textBaseline='alphabetic';ctx.fillStyle='#858689';
    const tickCount=W<450?3:5;
    for(let k=0;k<tickCount;k++){
      const idx=Math.round(r.months*k/(tickCount-1));
      const label=idx===0?'START':idx<12?`${idx}M`:`${Math.floor(idx/12)}Y${idx%12?` ${idx%12}M`:''}`;
      ctx.fillText(label,x(idx),H-12);
    }
    function path(values,stroke,width,dash){
      ctx.beginPath();values.forEach((v,i)=>i?ctx.lineTo(x(i),y(v)):ctx.moveTo(x(i),y(v)));
      ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.setLineDash(dash||[]);ctx.stroke();ctx.setLineDash([]);
    }
    // Area under the balance curve: clipped to graph and filled with subtle monochrome gradient.
    ctx.save();ctx.beginPath();ctx.rect(margin.left,margin.top,graphW,graphH);ctx.clip();
    ctx.beginPath();main.forEach((v,i)=>i?ctx.lineTo(x(i),y(v)):ctx.moveTo(x(i),y(v)));
    ctx.lineTo(x(r.months),y(Math.max(0,min)));ctx.lineTo(x(0),y(Math.max(0,min)));ctx.closePath();
    const grad=ctx.createLinearGradient(0,margin.top,0,margin.top+graphH);
    grad.addColorStop(0,'rgba(245,245,240,.12)');grad.addColorStop(1,'rgba(245,245,240,0)');
    ctx.fillStyle=grad;ctx.fill();
    if(showGoal){ctx.strokeStyle='#525357';ctx.lineWidth=1;ctx.setLineDash([2,6]);ctx.beginPath();ctx.moveTo(margin.left,y(goal));ctx.lineTo(W-margin.right,y(goal));ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#96979a';ctx.textAlign='right';ctx.font='9px system-ui';ctx.fillText('GOAL',W-margin.right-3,y(goal)-6);}
    path(flat,'#5c5d60',1.5,[2,5]);
    path(paid,'#a4a5a8',1.6,[7,5]);
    path(main,'#f7f6f2',2.8,[]);
    if(hoveredIndex>=0){
      const i=Math.min(r.months,hoveredIndex),xx=x(i),yy=y(main[i]);
      ctx.strokeStyle='#999a9c';ctx.lineWidth=1;ctx.setLineDash([3,4]);ctx.beginPath();ctx.moveTo(xx,margin.top);ctx.lineTo(xx,margin.top+graphH);ctx.stroke();ctx.setLineDash([]);
      ctx.fillStyle='#f7f7f5';ctx.beginPath();ctx.arc(xx,yy,4,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle='#121315';ctx.lineWidth=1.5;ctx.stroke();
    }
    ctx.restore();
  }
  function hoverChart(event) {
    if(!chartLayout||!currentResult)return;
    const canvas=$('growthChart'),b=canvas.getBoundingClientRect();
    const xx=event.clientX-b.left;
    const {margin,graphW}=chartLayout;
    if(xx<margin.left-10||xx>margin.left+graphW+10){hideTooltip();return;}
    hoveredIndex=Math.max(0,Math.min(currentResult.months,Math.round((xx-margin.left)/graphW*currentResult.months)));
    drawChart();
    const p=currentResult.monthly[hoveredIndex];
    const scale=chartView==='real'?currentResult.inflationFactor(hoveredIndex):1;
    const compare=currentResult.noContrib.monthly[hoveredIndex];
    const tooltip=$('chartTooltip');
    const heading=hoveredIndex===0?'Starting balance':`Year ${Math.floor(hoveredIndex/12)}, Month ${hoveredIndex%12}`;
    tooltip.innerHTML='';
    const title=document.createElement('strong');title.textContent=heading;tooltip.appendChild(title);
    for(const [label,value] of [
      ['Balance',p.balance/scale],['Money paid in',p.netInvested/scale],['No contributions',compare.balance/scale]]){
      const line=document.createElement('div');const left=document.createElement('span');const right=document.createElement('b');
      left.textContent=label;right.textContent=money(value);line.append(left,right);tooltip.appendChild(line);
    }
    tooltip.hidden=false;
    const cw=b.width, posX=chartLayout.x(hoveredIndex);
    tooltip.style.left=`${Math.min(cw-210,Math.max(6,posX+12))}px`;
    tooltip.style.top=`${Math.max(5,Math.min(b.height-112,chartLayout.y(chartLayout.main[hoveredIndex])-80))}px`;
  }
  function hideTooltip() { hoveredIndex=-1;$('chartTooltip').hidden=true;drawChart(); }
  function update() {
    const s=readSettings();
    updateVisibility();
    const error=validationError(s);
    $('validationMessage').hidden=!error;
    if(error){$('validationMessage').textContent=error;return;}
    currentSettings=s;
    currentResult=calculate(s);
    renderStats(s,currentResult);renderTable(currentResult);drawChart();
    setText('chartModeHint',chartView==='real'?'Adjusted for estimated inflation':'Nominal values, before inflation');
    try{localStorage.setItem(STORAGE_KEY,JSON.stringify(s));}catch(e){/* file:// storage may be blocked */}
  }
  function scheduleUpdate(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;update();});}

  function downloadFile(filename,content,type){
    const blob=new Blob([content],{type});const url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function saveScenario() {
    if(!currentResult){showToast('Fix the invalid fields before saving.');return;}
    downloadFile('compound-scenario.json',JSON.stringify({app:'COMPOUND. Personal Finance Studio',version:1,settings:currentSettings},null,2),'application/json');
    showToast('Scenario saved as a JSON file.');
  }
  function exportCSV() {
    if(!currentResult)return;
    const rows=tableView==='yearly'?currentResult.yearly:currentResult.monthly;
    const cell=v=>`"${String(v).replaceAll('"','""')}"`;
    const lines=[[ 'Period','Deposits','Withdrawals','Interest earned','Net invested','Ending balance','Cumulative interest','Accrued (uncredited)' ].map(cell).join(',')];
    for(const r of rows){const data=[r.index===0?'Start':`${tableView==='yearly'?'Year':'Month'} ${r.index}`,r.deposited,r.withdrawn,r.earned,r.netInvested,r.balance,r.totalEarned,r.pending];lines.push(data.map(cell).join(','));}
    downloadFile(`compound-projection-${tableView}.csv`,'\ufeff'+lines.join('\r\n'),'text/csv;charset=utf-8');showToast('Projection table exported to CSV.');
  }
  function downloadChart() {
    if(!currentResult)return;
    const anchor=document.createElement('a');anchor.href=$('growthChart').toDataURL('image/png');anchor.download='compound-growth-chart.png';anchor.click();showToast('Chart exported as PNG.');
  }
  function loadSavedSettings() {
    try{const json=localStorage.getItem(STORAGE_KEY);if(json){const data=JSON.parse(json);if(data&&typeof data==='object')applySettings(data);}}catch(e){/* ignore bad/blocked storage */}
  }

  function init() {
    loadSavedSettings();updateFlowTabs();updateVisibility();
    for(const button of document.querySelectorAll('[data-flow]')) button.addEventListener('click',()=>{
      $('flow').value=button.dataset.flow;updateFlowTabs();scheduleUpdate();
    });
    form.addEventListener('input',scheduleUpdate);form.addEventListener('change',scheduleUpdate);
    $('chartModeButtons').addEventListener('click',e=>{
      const b=e.target.closest('[data-view]');if(!b)return;
      chartView=b.dataset.view;setSegmented('chartModeButtons','view',chartView);
      if(currentResult){renderGoal(currentSettings,currentResult);setText('chartModeHint',chartView==='real'?'Adjusted for estimated inflation':'Nominal values, before inflation');drawChart();}
    });
    $('tableModeButtons').addEventListener('click',e=>{
      const b=e.target.closest('[data-table]');if(!b)return;
      tableView=b.dataset.table;setSegmented('tableModeButtons','table',tableView);
      if(currentResult)renderTable(currentResult);
    });
    $('resetButton').addEventListener('click',()=>{
      applySettings(DEFAULTS);chartView='nominal';tableView='yearly';
      setSegmented('chartModeButtons','view',chartView);setSegmented('tableModeButtons','table',tableView);
      update();showToast('Restored default example.');
    });
    $('saveButton').addEventListener('click',saveScenario);
    $('importButton').addEventListener('click',()=>$('importFile').click());
    $('importFile').addEventListener('change',async event=>{
      const file=event.target.files[0];if(!file)return;
      if(file.size>100000){showToast('Scenario file is too large.');event.target.value='';return;}
      try{
        const parsed=JSON.parse(await file.text());
        if(!parsed || parsed.app!=='COMPOUND. Personal Finance Studio' || !parsed.settings || typeof parsed.settings!=='object')throw Error('Invalid scenario file');
        applySettings(parsed.settings);update();
        if($('validationMessage').hidden)showToast('Scenario loaded successfully.');else showToast('Scenario has invalid input values.');
      }catch(e){showToast('Could not read this scenario JSON file.');}
      event.target.value='';
    });
    $('exportCsv').addEventListener('click',exportCSV);
    $('downloadChart').addEventListener('click',downloadChart);
    $('growthChart').addEventListener('mousemove',hoverChart);
    $('growthChart').addEventListener('mouseleave',hideTooltip);
    $('growthChart').addEventListener('touchstart',e=>{if(e.touches[0])hoverChart(e.touches[0]);},{passive:true});
    $('growthChart').addEventListener('touchmove',e=>{if(e.touches[0])hoverChart(e.touches[0]);},{passive:true});
    $('growthChart').addEventListener('touchend',hideTooltip,{passive:true});
    if('ResizeObserver' in window)new ResizeObserver(drawChart).observe($('chartArea'));
    else window.addEventListener('resize',drawChart);
    update();
  }
  document.addEventListener('DOMContentLoaded',init);
  // Helpful for local test automation, with no server-side component.
  window.CompoundStudioTest = Object.freeze({simulate,calculate,defaults:DEFAULTS});
})();
