'use strict';

// ============================================================
//  2025 TAX CONSTANTS  (IRS / Colorado official figures)
// ============================================================
const C = {
  // Standard deductions
  STD_SINGLE: 15750,
  STD_HOH:    23625,

  // 2025 Federal Tax Brackets — Single
  // Source: IRS 2025 Tax Computation Worksheet, Section A
  BRACKETS_SINGLE: [
    { min: 0,       max: 11925,   rate: 0.10, subtraction: 0        },
    { min: 11925,   max: 48475,   rate: 0.12, subtraction: 238.50   },
    { min: 48475,   max: 103350,  rate: 0.22, subtraction: 5086.00  },
    { min: 103350,  max: 197300,  rate: 0.24, subtraction: 7153.00  },
    { min: 197300,  max: 250525,  rate: 0.32, subtraction: 22937.00 },
    { min: 250525,  max: 626350,  rate: 0.35, subtraction: 30452.75 },
    { min: 626350,  max: Infinity,rate: 0.37, subtraction: 42979.75 },
  ],

  // 2025 Federal Tax Brackets — Head of Household
  // Source: IRS 2025 Tax Computation Worksheet, Section D
  // Derived breakpoints: 10%→12% at $17,000; 12%→22% at $64,850
  BRACKETS_HOH: [
    { min: 0,       max: 17000,   rate: 0.10, subtraction: 0        },
    { min: 17000,   max: 64850,   rate: 0.12, subtraction: 340.00   },
    { min: 64850,   max: 103350,  rate: 0.22, subtraction: 6825.00  },
    { min: 103350,  max: 197300,  rate: 0.24, subtraction: 8892.00  },
    { min: 197300,  max: 250500,  rate: 0.32, subtraction: 24676.00 },
    { min: 250500,  max: 626350,  rate: 0.35, subtraction: 32191.00 },
    { min: 626350,  max: Infinity,rate: 0.37, subtraction: 44718.00 },
  ],

  // Long-term capital gains rates — Single (2025)
  LTCG_BRACKETS_SINGLE: [
    { max: 48350,   rate: 0.00 },
    { max: 533400,  rate: 0.15 },
    { max: Infinity,rate: 0.20 },
  ],
  // Long-term capital gains rates — HOH (2025)
  LTCG_BRACKETS_HOH: [
    { max: 64750,   rate: 0.00 },
    { max: 566700,  rate: 0.15 },
    { max: Infinity,rate: 0.20 },
  ],

  // Net Investment Income Tax
  NIIT_THRESHOLD: 200000,
  NIIT_RATE: 0.038,

  // IRA deductibility phase-out (covered by workplace plan, Single/HOH filer, 2025)
  IRA_PHASE_OUT_START: 79000,
  IRA_PHASE_OUT_END:   89000,
  IRA_MAX_UNDER50: 7000,
  IRA_MAX_50PLUS:  8000,

  // Student loan interest phase-out (Single, 2025)
  SLI_PHASE_OUT_START: 85000,
  SLI_PHASE_OUT_END:   100000,
  SLI_MAX: 2500,

  // Schedule 1-A phase-outs (Single, 2025)
  TIPS_PHASE_OUT_START:     150000,
  TIPS_PHASE_OUT_END:       175000,
  TIPS_MAX:                 25000,
  OT_PHASE_OUT_START:       150000,
  OT_PHASE_OUT_END:         175000,
  OT_MAX_SINGLE:            12500,
  CAR_PHASE_OUT_START:      100000,
  CAR_PHASE_OUT_END:        150000,
  CAR_MAX:                  10000,
  SENIOR_PHASE_OUT_START:   75000,
  SENIOR_PHASE_OUT_END:     175000,
  SENIOR_MAX:               6000,

  // Colorado
  CO_TAX_RATE: 0.044,  // 4.4% flat rate for 2025

  // Child tax credit (2025) — not applicable here, included for completeness
  CTC_PER_CHILD: 2200,
};

// ============================================================
//  HELPERS
// ============================================================
const fmt = (n) => {
  if (n === null || n === undefined || isNaN(n)) return '—';
  const abs = Math.abs(n);
  const formatted = abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < 0 ? `($${formatted})` : `$${formatted}`;
};

const fmtLine = (n) => {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const num = (id) => {
  const el = document.getElementById(id);
  if (!el) return 0;
  const v = parseFloat(el.value);
  return isNaN(v) ? 0 : v;
};

const radio = (name) => {
  const el = document.querySelector(`input[name="${name}"]:checked`);
  return el ? el.value : null;
};

const clamp = (val, min, max) => Math.min(Math.max(val, min), max);

// Phase-out helper: linear reduction from full → 0 between start and end thresholds
function phaseOut(amount, magi, phaseStart, phaseEnd) {
  if (magi <= phaseStart) return amount;
  if (magi >= phaseEnd)   return 0;
  const ratio = (magi - phaseStart) / (phaseEnd - phaseStart);
  return amount * (1 - ratio);
}

// ============================================================
//  CORE TAX CALCULATIONS
// ============================================================

function calcFederalTax(taxableIncome, brackets) {
  if (taxableIncome <= 0) return 0;
  for (let i = brackets.length - 1; i >= 0; i--) {
    if (taxableIncome > brackets[i].min) {
      return taxableIncome * brackets[i].rate - brackets[i].subtraction;
    }
  }
  return 0;
}

function calcStudentLoanDeduction(interest, magi) {
  const capped = Math.min(interest, C.SLI_MAX);
  return phaseOut(capped, magi, C.SLI_PHASE_OUT_START, C.SLI_PHASE_OUT_END);
}

function calcIRADeduction(contribution, age50plus, magi) {
  const maxContrib = age50plus ? C.IRA_MAX_50PLUS : C.IRA_MAX_UNDER50;
  const capped = Math.min(contribution, maxContrib);
  // Phase out for active workplace plan participant
  return phaseOut(capped, magi, C.IRA_PHASE_OUT_START, C.IRA_PHASE_OUT_END);
}

function calcSch1ADeductions(magi, tips, overtime, carLoan, isSenior) {
  const tipsDeduction   = phaseOut(Math.min(tips, C.TIPS_MAX), magi, C.TIPS_PHASE_OUT_START, C.TIPS_PHASE_OUT_END);
  const otDeduction     = phaseOut(Math.min(overtime, C.OT_MAX_SINGLE), magi, C.OT_PHASE_OUT_START, C.OT_PHASE_OUT_END);
  const carDeduction    = phaseOut(Math.min(carLoan, C.CAR_MAX), magi, C.CAR_PHASE_OUT_START, C.CAR_PHASE_OUT_END);
  const seniorDeduction = isSenior ? phaseOut(C.SENIOR_MAX, magi, C.SENIOR_PHASE_OUT_START, C.SENIOR_PHASE_OUT_END) : 0;
  return { tipsDeduction, otDeduction, carDeduction, seniorDeduction,
    total: tipsDeduction + otDeduction + carDeduction + seniorDeduction };
}

// Long-term cap gains tax (uses preferential rates, not ordinary income brackets)
function calcLTCGTax(ltcgAmount, ordinaryTaxableIncome, brackets) {
  if (ltcgAmount <= 0) return 0;
  // The LTCG rate depends on where the gains "stack" on top of ordinary income
  const stackedIncome = ordinaryTaxableIncome + ltcgAmount;
  let ltcgTax = 0;
  let remaining = ltcgAmount;
  for (const b of brackets) {
    if (remaining <= 0) break;
    if (stackedIncome > (brackets.indexOf(b) === 0 ? 0 : brackets[brackets.indexOf(b)-1].max)) {
      const roomInBracket = b.max - Math.max(ordinaryTaxableIncome, brackets.indexOf(b) === 0 ? 0 : brackets[brackets.indexOf(b)-1].max);
      const taxableInBracket = Math.min(remaining, Math.max(roomInBracket, 0));
      ltcgTax += taxableInBracket * b.rate;
      remaining -= taxableInBracket;
    }
  }
  return ltcgTax;
}

// ============================================================
//  MASTER CALCULATION  — returns a complete tax picture
// ============================================================
function computeAll() {
  const status = document.getElementById('filing-status')?.value || 'single';
  const isHOH  = status === 'hoh';
  const brackets = isHOH ? C.BRACKETS_HOH : C.BRACKETS_SINGLE;
  const ltcgBrackets = isHOH ? C.LTCG_BRACKETS_HOH : C.LTCG_BRACKETS_SINGLE;
  const stdDeduction = isHOH ? C.STD_HOH : C.STD_SINGLE;

  // ── Income ──
  const wages        = num('w2-box1');
  const skorpK1      = num('k1-box1') + num('k1-box2');
  const taxableInt   = num('interest-taxable') + num('interest-us-govt');
  const ordDiv       = num('div-ordinary');
  const qualDiv      = num('div-qualified');
  const ltcg         = Math.max(0, num('cap-gain-lt'));
  const stcg         = num('cap-gain-st');
  const capGainNet   = num('cap-gain-lt') + num('cap-gain-st');
  const capGain1040  = Math.max(-3000, capGainNet);   // Form 1040 line 7 max loss $3,000
  const unemployment = num('unemployment');
  const stateTaxRefund = num('state-tax-refund');
  const otherIncome  = num('other-income');

  const totalIncome = wages
    + skorpK1
    + taxableInt
    + ordDiv
    + capGain1040
    + unemployment
    + stateTaxRefund
    + otherIncome;

  // ── Schedule 1-A (new 2025 deductions, above-the-line) ──
  // Computed using preliminary MAGI (total income before 1-A deductions)
  const hasTips    = radio('has-tips') === 'yes';
  const hasOT      = radio('has-overtime') === 'yes';
  const hasCarLoan = radio('has-car-loan') === 'yes';
  const isSenior   = radio('is-senior') === 'yes';

  const sch1a = calcSch1ADeductions(
    totalIncome,
    hasTips    ? num('qualified-tips')      : 0,
    hasOT      ? num('qualified-overtime')  : 0,
    hasCarLoan ? num('car-loan-interest')   : 0,
    isSenior
  );

  // ── Other adjustments (Schedule 1, Part II) ──
  const hasIRA         = radio('has-ira') === 'yes';
  const hasSLI         = radio('has-student-loan') === 'yes';
  const hasHSA         = radio('has-hsa') === 'yes';

  const sliRaw         = hasSLI ? num('student-loan-interest') : 0;
  const iraRaw         = hasIRA ? num('ira-contribution') : 0;
  const hsaRaw         = hasHSA ? num('hsa-contribution') : 0;

  // Preliminary MAGI for phase-out checks (before Schedule 1-A)
  const magiPrelim = totalIncome;

  const sliDeduction   = calcStudentLoanDeduction(sliRaw, magiPrelim);
  const iraDeduction   = calcIRADeduction(iraRaw, false, magiPrelim);  // age handled via UI
  const hsaDeduction   = Math.min(hsaRaw, 4300);  // self-only HDHP limit

  const totalAdjustments = sch1a.total + sliDeduction + iraDeduction + hsaDeduction;

  // ── AGI ──
  const agi = totalIncome - totalAdjustments;

  // ── Deductions ──
  const itemPropertyTax  = num('item-property-tax');
  const itemCharityCash  = num('item-charity-cash');
  const itemCharityNC    = num('item-charity-noncash');
  const itemMedicalTotal = num('item-medical');
  const medicalFloor     = agi * 0.075;
  const itemMedical      = Math.max(0, itemMedicalTotal - medicalFloor);
  const saltCap          = 40000;  // 2025 SALT cap
  const saltActual       = Math.min(itemPropertyTax, saltCap);
  const totalItemized    = saltActual + itemCharityCash + itemCharityNC + itemMedical;
  const useItemized      = totalItemized > stdDeduction;
  const deduction        = Math.max(totalItemized, stdDeduction);

  // ── Taxable Income ──
  const taxableIncome = Math.max(0, agi - deduction);

  // ── Split income into ordinary and preferential ──
  // Qualified dividends and net long-term gains get preferential rates
  const preferentialIncome = Math.max(0, qualDiv + ltcg);
  const ordinaryTaxableIncome = Math.max(0, taxableIncome - preferentialIncome);

  // ── Federal Tax ──
  const ordinaryTax = calcFederalTax(ordinaryTaxableIncome, brackets);
  // LTCG / qualified dividend tax
  const prefTax = calcLTCGTax(preferentialIncome, ordinaryTaxableIncome, ltcgBrackets);
  let federalTax = Math.max(0, ordinaryTax + prefTax);

  // ── Net Investment Income Tax (3.8%) ──
  const netInvestmentIncome = Math.max(0, taxableInt + ordDiv + capGain1040);
  const niitBase = Math.min(netInvestmentIncome, Math.max(0, agi - C.NIIT_THRESHOLD));
  const niit = niitBase * C.NIIT_RATE;

  // ── Credits ──
  const hasChildCare  = radio('has-childcare') === 'yes';
  const hasEducation  = radio('has-education') === 'yes';
  const hasPTC        = radio('has-marketplace') === 'yes';

  // Child & Dependent Care Credit (Form 2441) — simplified
  let childCareCredit = 0;
  if (hasChildCare) {
    const careExpenses = Math.min(num('childcare-expenses'), 3000);
    const creditPct    = agi > 43000 ? 0.20 : agi > 33000 ? 0.25 : agi > 23000 ? 0.30 : 0.35;
    childCareCredit    = careExpenses * creditPct;
  }

  // Education credits (simplified: Lifetime Learning Credit = 20% of expenses, max $2,000)
  let educationCredit = 0;
  if (hasEducation) {
    educationCredit = Math.min(num('education-expenses') * 0.20, 2000);
  }

  // Premium Tax Credit
  const ptcNet = hasPTC ? num('ptc-net') : 0;
  const ptcCredit = Math.max(0, ptcNet);
  const ptcRepay  = Math.max(0, -ptcNet);

  const totalCredits = childCareCredit + educationCredit + ptcCredit;

  // Tax after credits (non-refundable credits can't below 0)
  const taxAfterCredits = Math.max(0, federalTax + niit + ptcRepay - totalCredits);

  // ── Social Security / Medicare checks ──
  const ssTaxed        = num('w2-box4');
  const medicareTaxed  = num('w2-box6');
  const ssWagesLimit   = 176100;  // 2025 SS wage base
  const ssExpected     = Math.min(wages, ssWagesLimit) * 0.062;
  const ssOverwithheld = Math.max(0, ssTaxed - ssExpected);  // rare; worth noting

  // Additional Medicare Tax (0.9%) on wages over $200,000 (Single)
  const addlMedicareTax = Math.max(0, wages - 200000) * 0.009;

  const totalTax = taxAfterCredits + addlMedicareTax;

  // ── Payments ──
  const fedWithheld   = num('w2-box2');
  const fedEstimated  = num('fed-estimated-payments');
  const totalPayments = fedWithheld + fedEstimated + ssOverwithheld;

  // ── Federal Refund / Owe ──
  const fedBalance = totalPayments - totalTax;
  const fedRefund  = fedBalance >= 0 ?  fedBalance : 0;
  const fedOwed    = fedBalance < 0  ? -fedBalance : 0;

  // ── Colorado ──
  const coWithheld       = num('w2-box17');
  const coEstimated      = num('co-estimated-payments');
  const coAdditions      = num('co-additions');
  const coUsInterest     = num('co-us-interest');
  const coPension        = num('co-pension');
  const coOtherSub       = num('co-other-subtractions');
  const coOtherCredits   = num('co-other-credits');
  const coTotalSub       = coUsInterest + coPension + coOtherSub;

  // Colorado starts from federal taxable income (Form 1040, Line 15)
  const coTaxableIncome  = Math.max(0, taxableIncome + coAdditions - coTotalSub);
  const coTax            = coTaxableIncome * C.CO_TAX_RATE;
  const coTotalPayments  = coWithheld + coEstimated + coOtherCredits;
  const coBalance        = coTotalPayments - coTax;
  const coRefund         = coBalance >= 0 ?  coBalance : 0;
  const coOwed           = coBalance < 0  ? -coBalance : 0;

  return {
    status, isHOH, stdDeduction, brackets, ltcgBrackets,
    // Income
    wages, skorpK1, taxableInt, ordDiv, qualDiv,
    ltcg, stcg, capGainNet, capGain1040,
    unemployment, stateTaxRefund, otherIncome, totalIncome,
    // Sch 1-A
    sch1a,
    // Adjustments
    sliDeduction, iraDeduction, hsaDeduction, iraRaw, sliRaw,
    totalAdjustments,
    // AGI
    agi,
    // Deductions
    useItemized, deduction, stdDeduction, totalItemized,
    itemPropertyTax, saltActual, itemCharityCash, itemCharityNC,
    itemMedical, itemMedicalTotal, medicalFloor,
    // Taxable Income
    taxableIncome, ordinaryTaxableIncome, preferentialIncome,
    // Tax
    ordinaryTax, prefTax, federalTax, niit, addlMedicareTax,
    // Credits
    childCareCredit, educationCredit, ptcCredit, ptcRepay, ptcNet, totalCredits,
    taxAfterCredits, totalTax,
    // Payments
    fedWithheld, fedEstimated, ssTaxed, medicareTaxed,
    ssOverwithheld, totalPayments,
    // Federal result
    fedBalance, fedRefund, fedOwed,
    // Colorado
    coWithheld, coEstimated, coAdditions, coUsInterest,
    coPension, coOtherSub, coTotalSub,
    coTaxableIncome, coTax, coTotalPayments, coBalance, coRefund, coOwed,
  };
}

// ============================================================
//  SIDEBAR RUNNING TOTALS
// ============================================================
function recalculate() {
  try {
    const t = computeAll();
    const set = (id, val, cls) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.textContent = val;
      if (cls) { el.className = 'calc-value ' + cls; }
    };

    set('rc-wages',       fmt(t.wages));
    set('rc-scorp',       fmt(t.skorpK1));
    set('rc-other',       fmt(t.taxableInt + t.ordDiv + t.capGain1040 + t.unemployment + t.stateTaxRefund + t.otherIncome));
    set('rc-total-income',fmt(t.totalIncome));
    set('rc-adj',         t.totalAdjustments > 0 ? fmt(-t.totalAdjustments) : '—');
    set('rc-agi',         fmt(t.agi));
    set('rc-deduction',   fmt(-t.deduction));
    set('rc-taxable',     fmt(t.taxableIncome));
    set('rc-tax',         fmt(t.totalTax));
    set('rc-credits',     t.totalCredits > 0 ? fmt(-t.totalCredits) : '—');
    set('rc-withholding', fmt(-t.totalPayments));

    const resultLabel = document.getElementById('rc-result-label');
    const resultVal   = document.getElementById('rc-result');
    const resultRow   = document.getElementById('rc-result-row');
    if (resultLabel && resultVal && resultRow) {
      if (t.fedRefund > 0) {
        resultLabel.textContent = 'Estimated refund';
        resultVal.textContent   = fmt(t.fedRefund);
        resultVal.style.color   = 'var(--green)';
        resultRow.classList.add('refund');
        resultRow.classList.remove('owe');
      } else if (t.fedOwed > 0) {
        resultLabel.textContent = 'Estimated amount owed';
        resultVal.textContent   = fmt(t.fedOwed);
        resultVal.style.color   = 'var(--red)';
        resultRow.classList.add('owe');
        resultRow.classList.remove('refund');
      } else {
        resultLabel.textContent = 'Estimated result';
        resultVal.textContent   = '$0.00';
        resultVal.style.color   = '';
      }
    }

    // Colorado sidebar
    set('rc-co-taxable',    fmt(t.coTaxableIncome));
    set('rc-co-tax',        fmt(t.coTax));
    set('rc-co-withholding',fmt(-t.coWithheld - t.coEstimated - t.coOtherCredits));
    const coLabel = document.getElementById('rc-co-result-label');
    const coVal   = document.getElementById('rc-co-result');
    if (coLabel && coVal) {
      if (t.coRefund > 0) {
        coLabel.textContent = 'CO est. refund';
        coVal.textContent   = fmt(t.coRefund);
        coVal.style.color   = 'var(--green)';
      } else if (t.coOwed > 0) {
        coLabel.textContent = 'CO amount owed';
        coVal.textContent   = fmt(t.coOwed);
        coVal.style.color   = 'var(--red)';
      } else {
        coLabel.textContent = 'CO est. result';
        coVal.textContent   = '$0.00';
        coVal.style.color   = '';
      }
    }

    // Dynamic messages within steps
    updateDeductionComparison(t);
    updateIRAMessage(t);
    updateCOPreview(t);
  } catch(e) {
    console.error('Calculation error:', e);
  }
}

function updateDeductionComparison(t) {
  const el = document.getElementById('deduction-comparison');
  if (!el) return;
  const better = t.useItemized ? 'Itemized' : 'Standard';
  const cls    = t.useItemized ? 'callout-success' : 'callout-info';
  el.innerHTML = `
    <div class="callout ${cls}">
      <div class="callout-icon">${t.useItemized ? '✅' : '📏'}</div>
      <div class="callout-body">
        <div class="callout-title">Recommendation: Take the <strong>${better} Deduction</strong></div>
        <table style="width:100%;font-size:0.88rem;margin-top:8px;">
          <tr><td>Standard deduction</td><td style="text-align:right;font-weight:700;">${fmt(t.stdDeduction)}</td></tr>
          <tr><td>Your itemized total</td><td style="text-align:right;font-weight:700;">${fmt(t.totalItemized)}</td></tr>
          ${t.itemMedical > 0 ? `<tr><td style="padding-left:16px;color:var(--gray-500);font-size:0.8rem;">  Medical (after 7.5% floor)</td><td style="text-align:right;color:var(--gray-500);font-size:0.8rem;">${fmt(t.itemMedical)}</td></tr>` : ''}
          <tr style="border-top:1px solid var(--gray-200);"><td><strong>Deduction used</strong></td><td style="text-align:right;font-weight:800;">${fmt(t.deduction)}</td></tr>
        </table>
        ${!t.useItemized ? `<p style="margin-top:8px;font-size:0.82rem;">Your itemized deductions (${fmt(t.totalItemized)}) are less than the standard deduction, so you'll take the standard deduction of ${fmt(t.stdDeduction)} on Form 1040, Line 12.</p>` : ''}
      </div>
    </div>`;
}

function updateIRAMessage(t) {
  const el = document.getElementById('ira-deductibility-msg');
  if (!el) return;
  if (radio('has-ira') !== 'yes') { el.innerHTML = ''; return; }
  const deductible = t.iraDeduction;
  const contributed = t.iraRaw;
  const pct = contributed > 0 ? Math.round((deductible / contributed) * 100) : 0;
  if (deductible >= contributed && contributed > 0) {
    el.innerHTML = `<div class="callout callout-success" style="margin-top:8px;"><div class="callout-body" style="font-size:0.85rem;">✅ Your full ${fmt(contributed)} IRA contribution appears to be deductible based on your income.</div></div>`;
  } else if (deductible > 0) {
    el.innerHTML = `<div class="callout callout-warn" style="margin-top:8px;"><div class="callout-body" style="font-size:0.85rem;">⚠️ Only ${fmt(deductible)} (~${pct}%) of your IRA contribution is deductible because your income is in the phase-out range ($${C.IRA_PHASE_OUT_START.toLocaleString()}–$${C.IRA_PHASE_OUT_END.toLocaleString()}). The rest is a non-deductible contribution.</div></div>`;
  } else {
    el.innerHTML = `<div class="callout callout-warn" style="margin-top:8px;"><div class="callout-body" style="font-size:0.85rem;">⚠️ Your IRA contribution is <strong>not deductible</strong> because your income exceeds $${C.IRA_PHASE_OUT_END.toLocaleString()}. You can still contribute (non-deductible) or consider a Roth IRA instead — but that has its own income limits.</div></div>`;
  }
}

function updateCOPreview(t) {
  const el = document.getElementById('co-calc-preview');
  if (!el) return;
  el.innerHTML = `
    <div class="callout callout-info">
      <div class="callout-icon">🏔️</div>
      <div class="callout-body">
        <div class="callout-title">Colorado calculation preview</div>
        <table style="width:100%;font-size:0.88rem;margin-top:6px;">
          <tr><td>Federal taxable income (1040 Line 15)</td><td style="text-align:right;">${fmt(t.taxableIncome)}</td></tr>
          <tr><td>+ Colorado additions</td><td style="text-align:right;">${fmt(t.coAdditions)}</td></tr>
          <tr><td>− Colorado subtractions</td><td style="text-align:right;">(${fmt(t.coTotalSub)})</td></tr>
          <tr style="border-top:1px solid var(--gray-200);font-weight:700;"><td>Colorado taxable income</td><td style="text-align:right;">${fmt(t.coTaxableIncome)}</td></tr>
          <tr><td>× 4.4% flat rate</td><td style="text-align:right;">${fmt(t.coTax)}</td></tr>
          <tr><td>− CO withholding (W-2 Box 17)</td><td style="text-align:right;">(${fmt(t.coWithheld)})</td></tr>
          <tr style="border-top:1px solid var(--gray-200);font-weight:700;color:${t.coRefund > 0 ? 'var(--green)' : 'var(--red)'};">
            <td>${t.coRefund > 0 ? 'Colorado refund' : 'Colorado amount owed'}</td>
            <td style="text-align:right;">${fmt(t.coRefund > 0 ? t.coRefund : t.coOwed)}</td>
          </tr>
        </table>
      </div>
    </div>`;
}

// ============================================================
//  STEP NAVIGATION
// ============================================================
let currentStep = 0;
const TOTAL_STEPS = 12;  // 0–11

function goToStep(n) {
  document.querySelectorAll('.step-panel').forEach(p => p.classList.remove('active'));
  const target = n <= 10
    ? document.getElementById(`step-${n}`)
    : document.getElementById('step-summary');
  if (target) target.classList.add('active');
  currentStep = n;
  updateProgress();
  updateSidebarNav();
  window.scrollTo({ top: 0, behavior: 'smooth' });

  // Step-specific triggers
  if (n === 7) updateDeductionComparison(computeAll());
  if (n === 10) buildReviewPage();
}

function validateAndGo(nextStep) {
  // W-2 basic validation
  if (currentStep === 2) {
    const wages = num('w2-box1');
    if (wages === 0) {
      const msg = document.getElementById('w2-validation-msg');
      if (msg) msg.innerHTML = `<div class="callout callout-error"><div class="callout-icon">❌</div><div class="callout-body">Please enter your wages from Box 1 of your W-2. This is required.</div></div>`;
      return;
    }
    const msg = document.getElementById('w2-validation-msg');
    if (msg) msg.innerHTML = '';
  }
  goToStep(nextStep);
}

function updateProgress() {
  const pct = Math.round((currentStep / (TOTAL_STEPS - 1)) * 100);
  const fill  = document.getElementById('progress-fill');
  const label = document.getElementById('progress-step-label');
  const pctEl = document.getElementById('progress-pct');
  if (fill)  fill.style.width = pct + '%';
  if (pctEl) pctEl.textContent = pct + '%';
  if (label) {
    if (currentStep === 0) label.textContent = 'Welcome';
    else if (currentStep === 11) label.textContent = 'Complete';
    else label.textContent = `Step ${currentStep} of 11`;
  }
}

function updateSidebarNav() {
  document.querySelectorAll('.step-nav-item').forEach(el => {
    const n = parseInt(el.dataset.nav);
    el.classList.remove('active', 'complete');
    if (n === currentStep) el.classList.add('active');
    else if (n < currentStep) el.classList.add('complete');
  });
}

// ============================================================
//  HOH DETERMINATION
// ============================================================
function updateHOHTest() {
  const nightsVal   = radio('nights-test');
  const homeCostGrp = document.getElementById('home-cost-group');
  const resultEl    = document.getElementById('filing-status-result');
  const fsInput     = document.getElementById('filing-status');

  if (nightsVal === 'yes') {
    if (homeCostGrp) homeCostGrp.style.display = 'block';
    const costVal = radio('home-cost');
    if (costVal === 'yes') {
      fsInput.value = 'hoh';
      resultEl.innerHTML = `
        <div class="callout callout-success">
          <div class="callout-icon">✅</div>
          <div class="callout-body">
            <div class="callout-title">You qualify for Head of Household</div>
            <p>Based on your answers, you meet all three IRS tests. Your filing status will be <strong>Head of Household</strong>, giving you a standard deduction of <strong>$23,625</strong> and more favorable tax brackets.</p>
            <p style="margin-top:8px;font-size:0.83rem;">
              <strong>Important:</strong> Make sure you can document that your children lived with you more than 183 nights in 2025. The IRS may ask for school records, medical records, or other evidence. Per IRS Publication 501, the nights test uses actual physical presence in your home, not a custody agreement.
              <a href="https://www.irs.gov/publications/p501" target="_blank" rel="noopener" style="color:var(--blue);">IRS Pub. 501 — Filing Status</a>
            </p>
          </div>
        </div>`;
    } else if (costVal === 'no') {
      fsInput.value = 'single';
      resultEl.innerHTML = `
        <div class="callout callout-warn">
          <div class="callout-icon">⚠️</div>
          <div class="callout-body">
            <div class="callout-title">Filing status: Single</div>
            <p>Even though your children lived with you more than half the year, you did not pay more than half the cost of your home — so you don't qualify for Head of Household. Your filing status is <strong>Single</strong>, with a standard deduction of <strong>$15,750</strong>.</p>
          </div>
        </div>`;
    } else {
      resultEl.innerHTML = '';
    }
  } else {
    if (homeCostGrp) homeCostGrp.style.display = 'none';
    fsInput.value = 'single';
    resultEl.innerHTML = `
      <div class="callout callout-info">
        <div class="callout-icon">ℹ️</div>
        <div class="callout-body">
          <div class="callout-title">Filing status: Single</div>
          <p>Because your children did not live with you for more than half the year, you do not meet the qualifying person test for Head of Household. Your filing status is <strong>Single</strong>, with a standard deduction of <strong>$15,750</strong>.</p>
        </div>
      </div>`;
  }
  recalculate();
}

// ============================================================
//  CONDITIONAL SECTION TOGGLES
// ============================================================
function toggleCapGains() {
  const s = document.getElementById('capital-gains-section');
  if (s) s.classList.toggle('visible', radio('has-capital-gains') === 'yes');
  recalculate();
}
function toggleTips() {
  const s = document.getElementById('tips-section');
  if (s) s.classList.toggle('visible', radio('has-tips') === 'yes');
  recalculate();
}
function toggleOvertime() {
  const s = document.getElementById('overtime-section');
  if (s) s.classList.toggle('visible', radio('has-overtime') === 'yes');
  recalculate();
}
function toggleCarLoan() {
  const s = document.getElementById('car-loan-section');
  if (s) s.classList.toggle('visible', radio('has-car-loan') === 'yes');
  recalculate();
}
function toggleIRA() {
  const s = document.getElementById('ira-section');
  if (s) s.classList.toggle('visible', radio('has-ira') === 'yes');
  recalculate();
}
function toggleStudentLoan() {
  const s = document.getElementById('student-loan-section');
  if (s) s.classList.toggle('visible', radio('has-student-loan') === 'yes');
  recalculate();
}
function toggleHSA() {
  const s = document.getElementById('hsa-section');
  if (s) s.classList.toggle('visible', radio('has-hsa') === 'yes');
  recalculate();
}
function toggleChildCare() {
  const s = document.getElementById('childcare-section');
  if (s) s.classList.toggle('visible', radio('has-childcare') === 'yes');
  recalculate();
}
function toggleEducation() {
  const s = document.getElementById('education-section');
  if (s) s.classList.toggle('visible', radio('has-education') === 'yes');
  recalculate();
}
function toggleMarketplace() {
  const s = document.getElementById('marketplace-section');
  if (s) s.classList.toggle('visible', radio('has-marketplace') === 'yes');
  recalculate();
}

// ============================================================
//  REVIEW PAGE (Step 10)
// ============================================================
function buildReviewPage() {
  const t  = computeAll();
  const el = document.getElementById('review-content');
  if (!el) return;

  const row = (label, val) =>
    `<div class="calc-row"><span class="calc-label">${label}</span><span class="calc-value">${val}</span></div>`;

  el.innerHTML = `
    <div class="section-label">Income Summary</div>
    <div style="background:var(--gray-50);border-radius:6px;padding:12px 16px;margin-bottom:16px;">
      ${row('Filing status', t.isHOH ? 'Head of Household' : 'Single')}
      ${row('W-2 wages (Minerva)', fmt(t.wages))}
      ${row('S-Corp K-1 income (loss)', fmt(t.skorpK1))}
      ${row('Interest income', fmt(t.taxableInt))}
      ${row('Dividend income', fmt(t.ordDiv))}
      ${row('Capital gain (loss)', fmt(t.capGain1040))}
      ${row('Other income', fmt(t.unemployment + t.stateTaxRefund + t.otherIncome))}
      ${row('<strong>Total income</strong>', `<strong>${fmt(t.totalIncome)}</strong>`)}
      ${row('Adjustments (Schedule 1 + 1-A)', fmt(-t.totalAdjustments))}
      ${row('<strong>Adjusted Gross Income (AGI)</strong>', `<strong>${fmt(t.agi)}</strong>`)}
    </div>
    <div class="section-label">Deductions &amp; Tax</div>
    <div style="background:var(--gray-50);border-radius:6px;padding:12px 16px;margin-bottom:16px;">
      ${row(t.useItemized ? 'Itemized deduction (Schedule A)' : 'Standard deduction', fmt(-t.deduction))}
      ${row('<strong>Federal taxable income</strong>', `<strong>${fmt(t.taxableIncome)}</strong>`)}
      ${row('Federal income tax', fmt(t.totalTax))}
      ${row('Federal withholding (W-2 Box 2)', fmt(-t.fedWithheld))}
      ${row('Other payments', fmt(-t.fedEstimated))}
      ${row('<strong>Federal ' + (t.fedRefund > 0 ? 'Refund' : 'Amount Owed') + '</strong>',
        `<strong style="color:${t.fedRefund > 0 ? 'var(--green)' : 'var(--red)'};">${fmt(t.fedRefund > 0 ? t.fedRefund : -t.fedOwed)}</strong>`)}
    </div>
    <div class="section-label">Colorado Summary</div>
    <div style="background:var(--gray-50);border-radius:6px;padding:12px 16px;">
      ${row('Colorado taxable income', fmt(t.coTaxableIncome))}
      ${row('Colorado tax (4.4%)', fmt(t.coTax))}
      ${row('Colorado withholding', fmt(-t.coWithheld))}
      ${row('<strong>Colorado ' + (t.coRefund > 0 ? 'Refund' : 'Amount Owed') + '</strong>',
        `<strong style="color:${t.coRefund > 0 ? 'var(--green)' : 'var(--red)'};">${fmt(t.coRefund > 0 ? t.coRefund : -t.coOwed)}</strong>`)}
    </div>`;
}

// ============================================================
//  FINAL SUMMARY GENERATOR (Step 11)
// ============================================================
function generateAndShowSummary() {
  goToStep(11);
  const t = computeAll();
  const el = document.getElementById('summary-content');
  if (!el) return;

  const statusLabel = t.isHOH ? 'Head of Household' : 'Single';

  // ── Result boxes at top ──
  const fedBox = t.fedRefund > 0
    ? `<div class="result-box refund"><div class="result-label">🎉 Federal Refund</div><div class="result-amount">${fmt(t.fedRefund)}</div></div>`
    : t.fedOwed > 0
    ? `<div class="result-box owe"><div class="result-label">⚠️ Federal Amount Owed</div><div class="result-amount">${fmt(t.fedOwed)}</div></div>`
    : `<div class="result-box zero"><div class="result-label">Federal Result</div><div class="result-amount">$0.00</div></div>`;

  const coBox = t.coRefund > 0
    ? `<div class="result-box refund"><div class="result-label">🎉 Colorado Refund</div><div class="result-amount">${fmt(t.coRefund)}</div></div>`
    : t.coOwed > 0
    ? `<div class="result-box owe"><div class="result-label">⚠️ Colorado Amount Owed</div><div class="result-amount">${fmt(t.coOwed)}</div></div>`
    : `<div class="result-box zero"><div class="result-label">Colorado Result</div><div class="result-amount">$0.00</div></div>`;

  // ── Helper to build form line table ──
  const tableRow = (lineNum, desc, val, note='', cls='') =>
    `<tr><td class="line-num">${lineNum}</td><td class="line-desc">${desc}${note ? `<span class="line-note">${note}</span>` : ''}</td><td class="line-val ${cls}">${val}</td></tr>`;
  const sectionRow = (title) =>
    `<tr class="section-row"><td colspan="3">${title}</td></tr>`;
  const skipRow = (desc) =>
    `<tr><td class="line-num">—</td><td class="line-desc" style="color:var(--gray-400);font-style:italic;">${desc}</td><td class="line-val" style="color:var(--gray-400);">0 / blank</td></tr>`;

  // ── FORM 1040 ──
  const f1040 = `
    <table class="form-line-table">
      ${sectionRow('Form 1040 — U.S. Individual Income Tax Return')}
      ${tableRow('Top', 'Filing Status box to check', statusLabel)}
      ${tableRow('Top', 'Digital Assets question', 'Answer Yes/No based on whether you used cryptocurrency')}
      ${sectionRow('Income')}
      ${tableRow('1a', 'Wages, salaries, tips (W-2 Box 1)', fmtLine(t.wages), 'From your Minerva University W-2')}
      ${t.taxableInt > 0 ? tableRow('2b', 'Taxable interest', fmtLine(t.taxableInt)) : skipRow('Line 2b — Taxable interest (none entered)')}
      ${t.ordDiv > 0 ? tableRow('3b', 'Ordinary dividends', fmtLine(t.ordDiv)) : skipRow('Line 3b — Ordinary dividends (none entered)')}
      ${t.qualDiv > 0 ? tableRow('3a', 'Qualified dividends', fmtLine(t.qualDiv), 'Subset of 3b; taxed at lower rates') : skipRow('Line 3a — Qualified dividends (none entered)')}
      ${t.capGain1040 !== 0 ? tableRow('7', 'Capital gain or (loss)', fmtLine(t.capGain1040), 'Attach Schedule D if you have transactions') : skipRow('Line 7 — Capital gain or loss (none entered)')}
      ${t.skorpK1 !== 0 || t.unemployment !== 0 || t.stateTaxRefund !== 0 || t.otherIncome !== 0
        ? tableRow('8', 'Additional income from Schedule 1, Line 10', fmtLine(t.skorpK1 + t.unemployment + t.stateTaxRefund + t.otherIncome), 'See Schedule 1 detail below')
        : skipRow('Line 8 — Additional income from Schedule 1 (none)')}
      ${tableRow('9', 'Total income (add Lines 1a through 8)', fmtLine(t.totalIncome))}
      ${sectionRow('Adjusted Gross Income')}
      ${t.totalAdjustments > 0
        ? tableRow('10', 'Adjustments to income from Schedule 1, Part II', fmtLine(-t.totalAdjustments))
        : skipRow('Line 10 — Adjustments from Schedule 1 Part II (none)')}
      ${tableRow('11', 'Adjusted gross income (Line 9 + Line 10)', fmtLine(t.agi), '', 'highlight')}
      ${sectionRow('Tax and Credits')}
      ${tableRow('12', t.useItemized ? 'Itemized deductions (Schedule A)' : 'Standard deduction', fmtLine(t.deduction),
        t.useItemized ? 'See Schedule A detail below' : `Standard deduction for ${statusLabel}`)}
      ${t.sch1a.total > 0
        ? tableRow('13', 'Qualified deductions from Schedule 1-A', fmtLine(t.sch1a.total), 'New for 2025 — see Schedule 1-A below')
        : skipRow('Line 13 — Schedule 1-A deductions (none)')}
      ${tableRow('15', 'Taxable income (Line 11 − Line 12 − Line 13)', fmtLine(t.taxableIncome), '', 'highlight')}
      ${tableRow('16', 'Tax (from Tax Table or Computation Worksheet)', fmtLine(t.federalTax),
        `Use the 2025 Tax Computation Worksheet, Section ${t.isHOH ? 'D (HOH)' : 'A (Single)'} if taxable income ≥ $100,000`)}
      ${t.niit > 0 ? tableRow('17', 'Net investment income tax (Form 8960)', fmtLine(t.niit)) : skipRow('Line 17 — AMT / Form 8960 (none)')}
      ${tableRow('18', 'Add Lines 16 and 17', fmtLine(t.federalTax + t.niit))}
      ${t.childCareCredit > 0 ? tableRow('19', 'Child & dependent care credit (Form 2441)', fmtLine(t.childCareCredit)) : skipRow('Line 19 — Child & dependent care credit (none)')}
      ${t.educationCredit > 0 ? tableRow('20', 'Education credits (Form 8863)', fmtLine(t.educationCredit)) : skipRow('Line 20 — Education credits (none)')}
      ${tableRow('24', 'Total tax (after credits)', fmtLine(t.totalTax))}
      ${sectionRow('Payments')}
      ${tableRow('25a', 'Federal income tax withheld (W-2 Box 2)', fmtLine(t.fedWithheld), 'From your Minerva University W-2')}
      ${t.fedEstimated > 0 ? tableRow('26', 'Estimated tax payments (Form 1040-ES)', fmtLine(t.fedEstimated)) : skipRow('Line 26 — Estimated tax payments (none)')}
      ${tableRow('33', 'Total payments (add Lines 25a + 26 + others)', fmtLine(t.totalPayments))}
      ${sectionRow('Refund / Amount Owed')}
      ${t.fedRefund > 0
        ? tableRow('34', 'Amount overpaid (refund)', fmtLine(t.fedRefund), 'Enter routing/account number on Lines 35a–35d for direct deposit', 'refund')
        : skipRow('Line 34 — Refund (you do not have an overpayment)')}
      ${t.fedOwed > 0
        ? tableRow('37', 'Amount you owe', fmtLine(t.fedOwed), 'Pay by April 15, 2026. Options: IRS Direct Pay, debit/credit card, or check', 'owe')
        : skipRow('Line 37 — Amount owed (you have a refund or break even)')}
      ${sectionRow('Identity Verification (for e-filing)')}
      ${tableRow('Prior-year AGI', 'Enter on Free File Fillable Forms identity screen', '192,967', 'This was your 2024 Married Filing Jointly AGI. Use the full joint amount.')}
    </table>`;

  // ── SCHEDULE 1 ──
  const hasSch1Income = t.skorpK1 !== 0 || t.unemployment !== 0 || t.stateTaxRefund !== 0 || t.otherIncome !== 0;
  const hasSch1Adj    = t.sliDeduction > 0 || t.iraDeduction > 0 || t.hsaDeduction > 0;

  const sch1 = `
    <table class="form-line-table">
      ${sectionRow('Schedule 1 (Form 1040) — Additional Income and Adjustments')}
      ${sectionRow('Part I — Additional Income')}
      ${t.stateTaxRefund > 0
        ? tableRow('1', 'Taxable state tax refund (from 2024 CO return, if you itemized in 2024)', fmtLine(t.stateTaxRefund))
        : skipRow('Line 1 — State tax refund (not taxable if you took the standard deduction in 2024)')}
      ${t.skorpK1 !== 0
        ? tableRow('5', 'S-corporation income (loss) from Schedule E, Part II', fmtLine(t.skorpK1), 'Attach Schedule E')
        : skipRow('Line 5 — S-corp income/loss (zero — check your K-1)')}
      ${t.unemployment > 0
        ? tableRow('7', 'Unemployment compensation', fmtLine(t.unemployment))
        : skipRow('Line 7 — Unemployment compensation (none)')}
      ${t.otherIncome > 0
        ? tableRow('8z', 'Other income (prizes, awards, etc.)', fmtLine(t.otherIncome))
        : skipRow('Line 8z — Other income (none)')}
      ${tableRow('10', 'Total additional income (add Part I lines)', fmtLine(t.skorpK1 + t.unemployment + t.stateTaxRefund + t.otherIncome))}
      ${sectionRow('Part II — Adjustments to Income')}
      ${t.sliDeduction > 0
        ? tableRow('21', 'Student loan interest deduction', fmtLine(t.sliDeduction),
          t.sliRaw > t.sliDeduction ? `Your full ${fmt(t.sliRaw)} phases out; only ${fmt(t.sliDeduction)} is deductible` : '')
        : skipRow('Line 21 — Student loan interest (none or phase-out eliminated it)')}
      ${t.iraDeduction > 0
        ? tableRow('20', 'IRA deduction', fmtLine(t.iraDeduction))
        : skipRow('Line 20 — IRA deduction (none or income too high)')}
      ${t.hsaDeduction > 0
        ? tableRow('13', 'HSA deduction (Form 8889)', fmtLine(t.hsaDeduction))
        : skipRow('Line 13 — HSA deduction (none)')}
      ${tableRow('26', 'Total adjustments (add Part II lines)', fmtLine(t.sliDeduction + t.iraDeduction + t.hsaDeduction))}
    </table>`;

  // ── SCHEDULE 1-A ──
  const hasSch1A = t.sch1a.total > 0;
  const sch1a = hasSch1A ? `
    <table class="form-line-table">
      ${sectionRow('Schedule 1-A (Form 1040) — New 2025 Deductions')}
      ${t.sch1a.tipsDeduction > 0
        ? tableRow('Part II, Line 1', 'Qualified tips deduction', fmtLine(t.sch1a.tipsDeduction))
        : skipRow('Tips deduction — not applicable')}
      ${t.sch1a.otDeduction > 0
        ? tableRow('Part II, Line 2', 'Qualified overtime deduction', fmtLine(t.sch1a.otDeduction))
        : skipRow('Overtime deduction — not applicable')}
      ${t.sch1a.carDeduction > 0
        ? tableRow('Part II, Line 3', 'Qualified vehicle loan interest deduction', fmtLine(t.sch1a.carDeduction))
        : skipRow('Vehicle loan interest — not applicable')}
      ${t.sch1a.seniorDeduction > 0
        ? tableRow('Part II, Line 4', 'Enhanced senior deduction', fmtLine(t.sch1a.seniorDeduction))
        : skipRow('Senior deduction — not applicable')}
      ${tableRow('Total', 'Total Schedule 1-A deductions → Form 1040, Line 13', fmtLine(t.sch1a.total))}
    </table>` : '';

  // ── SCHEDULE E (Part II — S-Corp) ──
  const scorpName = document.getElementById('scorp-name')?.value || 'Your S-Corporation';
  const scorpEIN  = document.getElementById('scorp-ein')?.value  || 'XX-XXXXXXX';
  const schE = `
    <table class="form-line-table">
      ${sectionRow('Schedule E (Form 1040), Part II — S-Corporation Income')}
      ${tableRow('28, Col A', 'Name of S-corporation', scorpName)}
      ${tableRow('28, Col B', 'Employer Identification Number (EIN)', scorpEIN)}
      ${tableRow('28, Col C', 'Check if Form 8271 attached', 'Leave blank (only if tax shelter registration required)')}
      ${tableRow('28, Col D', 'Materially participated?', radio('material-participation') === 'yes' ? 'Yes — check the box' : 'No — do not check')}
      ${t.skorpK1 >= 0
        ? tableRow('28, Col E (income)', 'Nonpassive income from K-1 Box 1', fmtLine(t.skorpK1))
        : tableRow('28, Col F (loss)', 'Allowable loss from K-1 Box 1', fmtLine(Math.abs(t.skorpK1)))}
      ${t.skorpK1 >= 0
        ? tableRow('32', 'Total S-corporation income (positive K-1)', fmtLine(t.skorpK1))
        : tableRow('32', 'Total S-corporation loss (negative K-1)', fmtLine(Math.abs(t.skorpK1)))}
      ${tableRow('41', 'Total income or (loss) from Schedule E → Schedule 1, Line 5', fmtLine(t.skorpK1))}
      ${t.skorpK1 < 0 ? `${sectionRow('Important note on S-corp losses')}
      ${tableRow('—', 'Basis limitation', 'Your loss is only deductible up to your basis in the S-corp. If you have not tracked basis, consult a CPA or IRS Pub. 3402 before filing.')}` : ''}
    </table>`;

  // ── SCHEDULE A (only if itemizing) ──
  const schA = t.useItemized ? `
    <table class="form-line-table">
      ${sectionRow('Schedule A — Itemized Deductions (you are itemizing)')}
      ${tableRow('1', 'Medical and dental expenses (total)', fmtLine(t.itemMedicalTotal))}
      ${tableRow('3', 'Multiply AGI by 7.5% (the floor)', fmtLine(t.medicalFloor))}
      ${tableRow('4', 'Deductible medical (Line 1 minus Line 3)', fmtLine(t.itemMedical))}
      ${tableRow('5b', 'State and local income taxes withheld (W-2 Box 17)', fmtLine(t.coWithheld), 'Enter your Colorado withholding here')}
      ${tableRow('5c', 'Real estate taxes', fmtLine(t.itemPropertyTax))}
      ${tableRow('5e', 'Total SALT (capped at $40,000)', fmtLine(t.saltActual))}
      ${tableRow('16', 'Cash charitable contributions', fmtLine(t.itemCharityCash))}
      ${tableRow('17', 'Non-cash charitable contributions (attach Form 8283 if > $500)', fmtLine(t.itemCharityNC))}
      ${tableRow('17', 'Total gifts to charity', fmtLine(t.itemCharityCash + t.itemCharityNC))}
      ${tableRow('17', 'Total itemized deductions → Form 1040, Line 12', fmtLine(t.totalItemized), '', 'highlight')}
    </table>` : `
    <div class="callout callout-info">
      <div class="callout-icon">📏</div>
      <div class="callout-body">
        <strong>Schedule A not needed.</strong> Your standard deduction (${fmt(t.deduction)}) is larger than your itemized deductions (${fmt(t.totalItemized)}), so you will take the standard deduction. Do not attach Schedule A to your return.
      </div>
    </div>`;

  // ── COLORADO DR 0104 ──
  const coDR0104 = `
    <table class="form-line-table">
      ${sectionRow('Colorado DR 0104 — Individual Income Tax Return')}
      ${tableRow('1', 'Federal taxable income (Form 1040, Line 15)', fmtLine(t.taxableIncome))}
      ${sectionRow('DR 0104AD — Subtractions from Income')}
      ${t.coUsInterest > 0
        ? tableRow('5', 'U.S. government interest income (exempt from CO tax)', fmtLine(t.coUsInterest), 'Enter on DR 0104AD Line 5')
        : skipRow('U.S. government interest subtraction — none entered')}
      ${t.coPension > 0
        ? tableRow('Varies', 'Pension/retirement subtraction', fmtLine(t.coPension), 'See DR 0104AD for applicable line')
        : skipRow('Pension subtraction — none entered')}
      ${t.coOtherSub > 0
        ? tableRow('Varies', 'Other Colorado subtractions', fmtLine(t.coOtherSub))
        : skipRow('Other subtractions — none entered')}
      ${tableRow('Total sub.', 'Total Colorado subtractions', fmtLine(t.coTotalSub))}
      ${t.coAdditions > 0
        ? tableRow('Total add.', 'Total Colorado additions', fmtLine(t.coAdditions))
        : skipRow('Colorado additions — none entered')}
      ${sectionRow('DR 0104 — Tax Calculation')}
      ${tableRow('1+adj', 'Colorado taxable income (Line 1 + additions − subtractions)', fmtLine(t.coTaxableIncome))}
      ${tableRow('Tax line', 'Colorado income tax (4.4% × taxable income)', fmtLine(t.coTax),
        'Colorado flat rate for 2025. Source: Colorado Department of Revenue')}
      ${sectionRow('DR 0104 — Payments')}
      ${tableRow('36', 'Colorado income tax withheld (W-2 Box 17)', fmtLine(t.coWithheld))}
      ${t.coEstimated > 0
        ? tableRow('37', 'Colorado estimated tax payments', fmtLine(t.coEstimated))
        : skipRow('CO estimated payments — none entered')}
      ${t.coOtherCredits > 0
        ? tableRow('DR 0104CR', 'Other Colorado credits', fmtLine(t.coOtherCredits))
        : skipRow('Other CO credits — none entered')}
      ${tableRow('Total pmts', 'Total Colorado payments and credits', fmtLine(t.coTotalPayments))}
      ${sectionRow('DR 0104 — Result')}
      ${t.coRefund > 0
        ? tableRow('Refund', 'Colorado overpayment (refund)', fmtLine(t.coRefund), 'Choose direct deposit or check', 'refund')
        : tableRow('Owed', 'Colorado amount owed', fmtLine(t.coOwed), 'Pay by April 15, 2026 at Revenue.Colorado.gov', 'owe')}
    </table>`;

  // ── Next Steps ──
  const nextSteps = `
    <table class="form-line-table">
      ${sectionRow('How to File — Free File Fillable Forms')}
      ${tableRow('Step 1', 'Go to IRS.gov/FreeFile', 'Start at IRS.gov/FreeFile (not the software companies\' sites directly)')}
      ${tableRow('Step 2', 'Select "Free File Fillable Forms"', 'No income limit. Available January 26, 2026.')}
      ${tableRow('Step 3', 'Create an account and start Form 1040', 'You will need your prior-year AGI ($192,967) to verify your identity')}
      ${tableRow('Step 4', 'Enter Federal forms in this order', 'Schedule E → Schedule 1 → Schedule 1-A (if applicable) → Form 1040')}
      ${tableRow('Step 5', 'File Colorado return', 'Colorado can be filed at Revenue.Colorado.gov (MyColorado portal) or through the same e-file submission')}
      ${tableRow('Deadline', 'Filing deadline', 'April 15, 2026 for both federal and Colorado. Extension available (Form 4868 federal / DR 0158-I Colorado) — but an extension to file is NOT an extension to pay.')}
      ${tableRow('Payment', 'If you owe federal taxes', 'Pay at IRS.gov/payments (Direct Pay is free). Reference: tax year 2025, Form 1040')}
      ${tableRow('Payment', 'If you owe Colorado taxes', 'Pay at Revenue.Colorado.gov using e-check or credit card')}
    </table>`;

  // ── Assemble final output ──
  el.innerHTML = `
    ${fedBox}${coBox}

    <div class="summary-section">
      <div class="summary-section-title">Form 1040 — Line by Line</div>
      ${f1040}
    </div>

    <div class="summary-section">
      <div class="summary-section-title">Schedule 1 — Additional Income &amp; Adjustments</div>
      ${hasSch1Income || hasSch1Adj ? sch1 : '<div class="callout callout-info"><div class="callout-body">No additional income or adjustments — you may not need Schedule 1.</div></div>'}
    </div>

    ${hasSch1A ? `<div class="summary-section"><div class="summary-section-title">Schedule 1-A — New 2025 Deductions</div>${sch1a}</div>` : ''}

    <div class="summary-section">
      <div class="summary-section-title">Schedule E, Part II — S-Corporation</div>
      ${schE}
    </div>

    <div class="summary-section">
      <div class="summary-section-title">${t.useItemized ? 'Schedule A — Itemized Deductions' : 'Schedule A — Not Needed'}</div>
      ${schA}
    </div>

    <div class="summary-section">
      <div class="summary-section-title">Colorado DR 0104 — State Return</div>
      ${coDR0104}
    </div>

    <div class="summary-section">
      <div class="summary-section-title">Next Steps &amp; Filing Instructions</div>
      ${nextSteps}
    </div>`;
}

// ============================================================
//  INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  goToStep(0);
  recalculate();

  // Sync CO U.S. interest field from Step 4 automatically
  const usGovtField = document.getElementById('interest-us-govt');
  const coUsField   = document.getElementById('co-us-interest');
  if (usGovtField && coUsField) {
    usGovtField.addEventListener('input', () => {
      if (!coUsField._manuallyEdited) {
        coUsField.value = usGovtField.value;
        recalculate();
      }
    });
    coUsField.addEventListener('input', () => {
      coUsField._manuallyEdited = true;
    });
  }

  // Radio option highlight on selection
  document.querySelectorAll('.radio-option input[type="radio"]').forEach(input => {
    input.addEventListener('change', () => {
      const group = input.closest('.radio-group');
      if (group) {
        group.querySelectorAll('.radio-option').forEach(opt => opt.classList.remove('selected'));
        input.closest('.radio-option')?.classList.add('selected');
      }
    });
    // Set initial selected state
    if (input.checked) input.closest('.radio-option')?.classList.add('selected');
  });

  // Standard deduction display on step 7
  const stdDeductEl = document.getElementById('standard-deduction-amount');
  if (stdDeductEl) {
    const update = () => {
      const fs = document.getElementById('filing-status')?.value;
      const std = fs === 'hoh' ? C.STD_HOH : C.STD_SINGLE;
      stdDeductEl.textContent = `For your filing status (${fs === 'hoh' ? 'Head of Household' : 'Single'}), the 2025 standard deduction is ${fmt(std)}.`;
    };
    document.getElementById('filing-status')?.addEventListener('change', update);
    update();
  }
});
