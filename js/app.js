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
//  FORM 1120-S — S-CORPORATION INCOME CALCULATION
// ============================================================
function calc1120S() {
  const grossReceipts    = num('f1120s-gross-receipts');
  const returns          = num('f1120s-returns');
  const cogs             = num('f1120s-cogs');
  const otherIncome      = num('f1120s-other-income');

  const totalIncome      = grossReceipts - returns - cogs + otherIncome;  // Line 6

  const officerComp      = num('f1120s-officer-comp');     // Line 7
  const wages            = num('f1120s-wages');            // Line 8
  const repairs          = num('f1120s-repairs');          // Line 9
  const rents            = num('f1120s-rents');            // Line 11
  const taxes            = num('f1120s-taxes');            // Line 12
  const interest         = num('f1120s-interest');         // Line 13
  const depreciation     = num('f1120s-depreciation');     // Line 14
  const advertising      = num('f1120s-advertising');      // Line 16
  const benefits         = num('f1120s-benefits');         // Line 18
  const otherDeductions  = num('f1120s-other-deductions'); // Line 19

  const totalDeductions  = officerComp + wages + repairs + rents + taxes
                         + interest + depreciation + advertising + benefits
                         + otherDeductions;               // Line 20

  const ordinaryIncome   = totalIncome - totalDeductions; // Line 21

  const ownershipPct     = clamp(num('scorp-ownership-pct') || 100, 0.01, 100);
  const k1Box1           = ordinaryIncome * (ownershipPct / 100);

  return {
    grossReceipts, returns, cogs, otherIncome, totalIncome,
    officerComp, wages, repairs, rents, taxes,
    interest, depreciation, advertising, benefits, otherDeductions,
    totalDeductions, ordinaryIncome, ownershipPct, k1Box1,
  };
}

// ============================================================
//  FORM 8962 — PREMIUM TAX CREDIT CALCULATION
// ============================================================
// 2025 HHS Federal Poverty Guidelines (48 contiguous states + DC)
const FPL_2025 = [0, 15650, 21150, 26650, 32150, 37650, 43150, 48650, 54150];
const FPL_2025_EXTRA = 5500; // per additional person beyond 8

// IRS Table 2 applicable contribution percentage ranges (2025)
// Each entry: [lowerFPLpct, upperFPLpct, initialContribPct, finalContribPct]
const PTC_TABLE2 = [
  [100, 133, 0.0206, 0.0206],
  [133, 150, 0.0309, 0.0406],
  [150, 200, 0.0406, 0.0648],
  [200, 250, 0.0648, 0.0810],
  [250, 300, 0.0810, 0.0978],
  [300, Infinity, 0.0978, 0.0978],  // 2025: IRA extension keeps cap at 9.78% for 400%+
];

function calcForm8962(magi, familySize, enrollPrem, slcspPrem, aptcPaid) {
  const size  = Math.max(1, Math.round(familySize || 1));
  const fpl   = size <= 8 ? FPL_2025[size] : FPL_2025[8] + (size - 8) * FPL_2025_EXTRA;
  const fplPct = fpl > 0 ? (magi / fpl) * 100 : 0;  // Line 5

  // Look up applicable figure (Line 7) via Table 2 linear interpolation
  let applicablePct = 0;
  if (fplPct >= 100) {
    for (const [lo, hi, init, final] of PTC_TABLE2) {
      if (fplPct >= lo && fplPct < hi) {
        const range = hi === Infinity ? 1 : hi - lo;
        applicablePct = init + ((fplPct - lo) / range) * (final - init);
        break;
      }
    }
    if (fplPct >= 400) applicablePct = 0.0978; // IRA extension — no cliff above 400%
  }

  const annualContrib = magi * applicablePct;              // Line 8a
  const maxPTC        = Math.max(0, slcspPrem - annualContrib); // Line 11d
  const annualPTC     = Math.min(enrollPrem, maxPTC);      // Line 11e = Line 24
  const netPTC        = annualPTC - aptcPaid;              // Line 26

  return { fpl, fplPct, applicablePct, annualContrib, enrollPrem, slcspPrem, maxPTC, annualPTC, aptcPaid, netPTC };
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
  const f1120s       = calc1120S();
  const skorpK1      = f1120s.k1Box1 + num('k1-box2');
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

  // Premium Tax Credit — Form 8962 (calculated from 1095-A inputs + AGI)
  const ptc8962 = hasPTC
    ? calcForm8962(agi, num('f8962-family-size') || 1, num('f1095a-enroll-prem'), num('f1095a-slcsp'), num('f1095a-aptc'))
    : null;
  const ptcNet    = ptc8962 ? ptc8962.netPTC : 0;
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
    f1120s, wages, skorpK1, taxableInt, ordDiv, qualDiv,
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
    childCareCredit, educationCredit, ptcCredit, ptcRepay, ptcNet, ptc8962, totalCredits,
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
    updateF1120SDisplay(t);
    updateForm8962Display(t);
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

function updateF1120SDisplay(t) {
  const s = t.f1120s;
  const setText = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };
  setText('f1120s-disp-receipts',          fmt(s.grossReceipts));
  setText('f1120s-disp-returns',           fmt(s.returns));
  setText('f1120s-disp-cogs',              fmt(s.cogs));
  setText('f1120s-disp-other-income',      fmt(s.otherIncome));
  setText('f1120s-disp-total-income',      fmt(s.totalIncome));
  setText('f1120s-disp-total-deductions',  fmt(s.totalDeductions));
  const ordEl = document.getElementById('f1120s-disp-ordinary-income');
  if (ordEl) {
    ordEl.textContent = (s.ordinaryIncome >= 0 ? '' : '(') + fmt(Math.abs(s.ordinaryIncome)) + (s.ordinaryIncome < 0 ? ')' : '');
    ordEl.style.color = s.ordinaryIncome >= 0 ? 'var(--green)' : 'var(--red)';
  }
  // Sync K-1 Box 1 hidden input and display
  const k1Input = document.getElementById('k1-box1');
  if (k1Input) k1Input.value = s.k1Box1.toFixed(2);
  const k1Disp = document.getElementById('k1-box1-display');
  if (k1Disp) {
    k1Disp.textContent = (s.k1Box1 < 0 ? '(' : '') + fmt(Math.abs(s.k1Box1)) + (s.k1Box1 < 0 ? ')' : '');
    k1Disp.style.color = s.k1Box1 >= 0 ? '' : 'var(--red)';
  }
}

function updateForm8962Display(t) {
  const resultsEl = document.getElementById('form8962-results');
  if (!resultsEl) return;
  const p = t.ptc8962;
  if (!p || radio('has-marketplace') !== 'yes') {
    resultsEl.style.display = 'none';
    return;
  }
  resultsEl.style.display = '';
  const setText = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };
  setText('f8962-magi',       fmt(t.agi));
  setText('f8962-fpl',        fmt(p.fpl));
  setText('f8962-fpl-pct',    p.fplPct.toFixed(1) + '%');
  setText('f8962-app-pct',    (p.applicablePct * 100).toFixed(2) + '%');
  setText('f8962-contrib',    fmt(p.annualContrib));
  setText('f8962-enroll',     fmt(p.enrollPrem));
  setText('f8962-slcsp-disp', fmt(p.slcspPrem));
  setText('f8962-max-ptc',    fmt(p.maxPTC));
  setText('f8962-annual-ptc', fmt(p.annualPTC));
  setText('f8962-aptc-disp',  fmt(p.aptcPaid));
  const netEl = document.getElementById('f8962-net-ptc');
  if (netEl) {
    netEl.textContent = (p.netPTC >= 0 ? '+' : '') + fmt(p.netPTC);
    netEl.style.color = p.netPTC >= 0 ? 'var(--green)' : 'var(--red)';
  }
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
      ${(t.niit + t.ptcRepay + t.addlMedicareTax) > 0
        ? tableRow('17', 'Other taxes from Schedule 2, Line 10', fmtLine(t.niit + t.ptcRepay + t.addlMedicareTax),
            `Includes: ${[t.niit > 0 ? `NIIT ${fmt(t.niit)}` : '', t.ptcRepay > 0 ? `excess PTC repayment ${fmt(t.ptcRepay)}` : '', t.addlMedicareTax > 0 ? `add\'l Medicare tax ${fmt(t.addlMedicareTax)}` : ''].filter(Boolean).join(', ')} — see Schedule 2 below`, 'owe')
        : skipRow('Line 17 — Other taxes from Schedule 2 (none)')}
      ${tableRow('18', 'Add Lines 16 and 17', fmtLine(t.federalTax + t.niit + t.ptcRepay + t.addlMedicareTax))}
      ${t.childCareCredit > 0 ? tableRow('19', 'Child & dependent care credit (Form 2441, Line 11)', fmtLine(t.childCareCredit), 'See Form 2441 detail below') : skipRow('Line 19 — Child & dependent care credit (none)')}
      ${t.educationCredit > 0 ? tableRow('20', 'Education credits (Form 8863)', fmtLine(t.educationCredit), 'See Form 8863 detail below') : skipRow('Line 20 — Education credits (none)')}
      ${t.totalCredits > 0 ? tableRow('24', 'Other nonrefundable credits from Schedule 3, Line 8', fmtLine(t.totalCredits), 'See Schedule 3 detail below') : skipRow('Line 24 — Other nonrefundable credits (none)')}
      ${t.ptcCredit > 0 ? tableRow('30', 'Other payments / refundable credits from Schedule 3, Line 15', fmtLine(t.ptcCredit), 'Net Premium Tax Credit — see Form 8962 and Schedule 3 below', 'refund') : skipRow('Line 30 — Refundable credits from Schedule 3 (none)')}
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

  // ── FORM 1120-S ──
  const scorpName = document.getElementById('scorp-name')?.value || 'Your S-Corporation';
  const scorpEIN  = document.getElementById('scorp-ein')?.value  || 'XX-XXXXXXX';
  const fs = t.f1120s;
  const f1120sSummary = `
    <table class="form-line-table">
      ${sectionRow(`Form 1120-S — U.S. Income Tax Return for an S Corporation (${scorpName}, EIN ${scorpEIN})`)}
      ${sectionRow('Filing Notes')}
      ${tableRow('Due date', '1120-S filing deadline', 'March 17, 2026 (or September 15 with Form 7004 extension)')}
      ${tableRow('K-2 / K-3', 'International forms required?', 'No — K-2 and K-3 are only required for S-corps with foreign income, foreign shareholders, or international activities. Skip these entirely.')}
      ${sectionRow('Income (Page 1, Lines 1–6)')}
      ${tableRow('1a', 'Gross receipts or sales', fmtLine(fs.grossReceipts))}
      ${fs.returns > 0 ? tableRow('1b', 'Returns and allowances', fmtLine(fs.returns)) : skipRow('Line 1b — Returns and allowances (none)')}
      ${tableRow('1c', 'Balance (Line 1a − Line 1b)', fmtLine(fs.grossReceipts - fs.returns))}
      ${fs.cogs > 0 ? tableRow('2', 'Cost of goods sold', fmtLine(fs.cogs)) : skipRow('Line 2 — Cost of goods sold (service business, leave blank)')}
      ${tableRow('3', 'Gross profit (Line 1c − Line 2)', fmtLine(fs.grossReceipts - fs.returns - fs.cogs))}
      ${fs.otherIncome !== 0 ? tableRow('5', 'Other income (loss)', fmtLine(fs.otherIncome)) : skipRow('Line 5 — Other income (none)')}
      ${tableRow('6', 'Total income (loss)', fmtLine(fs.totalIncome), '', 'highlight')}
      ${sectionRow('Deductions (Page 1, Lines 7–20)')}
      ${fs.officerComp > 0 ? tableRow('7', 'Compensation of officers', fmtLine(fs.officerComp), 'Should match W-2 Box 1 you issued to yourself') : skipRow('Line 7 — Officer compensation (none)')}
      ${fs.wages > 0 ? tableRow('8', 'Salaries and wages (non-officer)', fmtLine(fs.wages)) : skipRow('Line 8 — Salaries and wages (none)')}
      ${fs.repairs > 0 ? tableRow('9', 'Repairs and maintenance', fmtLine(fs.repairs)) : skipRow('Line 9 — Repairs and maintenance (none)')}
      ${fs.rents > 0 ? tableRow('11', 'Rents', fmtLine(fs.rents)) : skipRow('Line 11 — Rents (none)')}
      ${fs.taxes > 0 ? tableRow('12', 'Taxes and licenses', fmtLine(fs.taxes), 'Include employer payroll taxes, state biz taxes, licenses') : skipRow('Line 12 — Taxes and licenses (none)')}
      ${fs.interest > 0 ? tableRow('13', 'Interest expense', fmtLine(fs.interest)) : skipRow('Line 13 — Interest expense (none)')}
      ${fs.depreciation > 0 ? tableRow('14', 'Depreciation (including Section 179, from Form 4562)', fmtLine(fs.depreciation)) : skipRow('Line 14 — Depreciation (none)')}
      ${fs.advertising > 0 ? tableRow('16', 'Advertising', fmtLine(fs.advertising)) : skipRow('Line 16 — Advertising (none)')}
      ${fs.benefits > 0 ? tableRow('18', 'Employee benefit programs', fmtLine(fs.benefits)) : skipRow('Line 18 — Employee benefit programs (none)')}
      ${fs.otherDeductions > 0 ? tableRow('19', 'Other deductions (phone, internet, software, professional fees, etc.)', fmtLine(fs.otherDeductions), 'Attach a statement listing each category') : skipRow('Line 19 — Other deductions (none)')}
      ${tableRow('20', 'Total deductions', fmtLine(fs.totalDeductions))}
      ${fs.ordinaryIncome >= 0
        ? tableRow('21', 'Ordinary business income', fmtLine(fs.ordinaryIncome), 'Goes to Schedule K, Line 1 → K-1 Box 1', 'highlight')
        : tableRow('21', 'Ordinary business loss', fmtLine(fs.ordinaryIncome), 'Goes to Schedule K, Line 1 → K-1 Box 1 (negative)', 'owe')}
      ${sectionRow('Schedule K — Shareholders\' Pro Rata Share Items (selected lines)')}
      ${tableRow('K-1', 'Ordinary business income (loss)', fmtLine(fs.ordinaryIncome), 'Line 1 of Schedule K — flows to each shareholder\'s K-1 Box 1 proportionally')}
      ${tableRow('K-16d', 'Distributions (Box 16, Code D)', fmtLine(num('k1-box16d')), 'Track against basis — not reported as income if basis is sufficient')}
    </table>`;

  // ── SCHEDULE K-1 + SCHEDULE E (Part II — S-Corp) ──
  const k1Box1 = fs.k1Box1;
  const schE = `
    <table class="form-line-table">
      ${sectionRow('Schedule K-1 (Form 1120-S) — Your Share')}
      ${tableRow('Box 1', 'Ordinary business income (loss)', fmtLine(k1Box1), `1120-S Line 21 × ${fs.ownershipPct}% ownership`)}
      ${num('k1-box2') !== 0 ? tableRow('Box 2', 'Net rental real estate income (loss)', fmtLine(num('k1-box2'))) : skipRow('Box 2 — Net rental real estate income (none)')}
      ${tableRow('Box 17, Code AC', 'Gross receipts for Sec. 448(c)', fmtLine(fs.grossReceipts), 'Required if gross receipts ≥ $27M; otherwise informational only')}
      ${sectionRow('Schedule E (Form 1040), Part II — S-Corporation Income')}
      ${tableRow('28, Col A', 'Name of S-corporation', scorpName)}
      ${tableRow('28, Col B', 'Employer Identification Number (EIN)', scorpEIN)}
      ${tableRow('28, Col D', 'Materially participated?', radio('material-participation') === 'yes' ? 'Yes — check the box' : 'No — do not check')}
      ${k1Box1 >= 0
        ? tableRow('28, Col E', 'Nonpassive income from K-1 Box 1', fmtLine(k1Box1))
        : tableRow('28, Col F', 'Allowable loss from K-1 Box 1', fmtLine(Math.abs(k1Box1)))}
      ${tableRow('32 / 34', 'Total income (loss) from all S-corps', fmtLine(t.skorpK1))}
      ${tableRow('41', 'Total Schedule E income (loss) → Schedule 1, Line 5', fmtLine(t.skorpK1))}
      ${t.skorpK1 < 0 ? `${sectionRow('Basis limitation reminder')}
      ${tableRow('—', 'Deductible only up to basis', 'Loss limited to your investment in the corp. See IRS Pub. 3402 if losses exceed your contributions.')}` : ''}
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

  // ── FORM 8962 ──
  const hasF8962 = t.ptc8962 !== null;
  const p = t.ptc8962;
  const f8962Summary = hasF8962 ? `
    <table class="form-line-table">
      ${sectionRow('Form 8962 — Premium Tax Credit (PTC)')}
      ${sectionRow('Part I — Annual and Monthly Contribution Amount')}
      ${tableRow('1', 'Family size', String(Math.max(1, Math.round(num('f8962-family-size') || 1))))}
      ${tableRow('3', 'Household income (MAGI)', fmtLine(t.agi), 'Same as your Form 1040 AGI (Line 11)')}
      ${tableRow('4', 'Federal poverty line', fmtLine(p.fpl), '2025 HHS guidelines for your household size')}
      ${tableRow('5', 'Federal poverty line percentage', p.fplPct.toFixed(1) + '%', 'Line 3 ÷ Line 4 × 100')}
      ${tableRow('7', 'Applicable figure (Table 2)', (p.applicablePct * 100).toFixed(2) + '%', 'Contribution percentage from IRS Table 2 based on Line 5')}
      ${tableRow('8a', 'Annual contribution amount', fmtLine(p.annualContrib), 'Line 3 × Line 7 — the amount you are expected to pay toward premiums')}
      ${tableRow('8b', 'Monthly contribution amount', fmtLine(p.annualContrib / 12), 'Line 8a ÷ 12')}
      ${sectionRow('Part II — Reconciliation of Advance Payment of PTC (annual method, all months same plan)')}
      ${tableRow('11a', 'Annual enrollment premium (1095-A Col A)', fmtLine(p.enrollPrem))}
      ${tableRow('11b', 'Annual SLCSP premium (1095-A Col B)', fmtLine(p.slcspPrem), 'Benchmark Second Lowest Cost Silver Plan for your area')}
      ${tableRow('11c', 'Annual advance PTC paid (1095-A Col C)', fmtLine(p.aptcPaid), 'Government subsidy paid directly to Connect for Health Colorado')}
      ${tableRow('11d', 'Maximum annual PTC', fmtLine(p.maxPTC), 'Line 11b minus Line 8a (cannot be less than $0)')}
      ${tableRow('11e', 'Annual PTC', fmtLine(p.annualPTC), 'Smaller of Line 11a or Line 11d')}
      ${sectionRow('Part III — Repayment of Excess Advance PTC')}
      ${tableRow('24', 'Total Premium Tax Credit', fmtLine(p.annualPTC), 'From Line 11e')}
      ${tableRow('25', 'Advance PTC already paid', fmtLine(p.aptcPaid), 'From Line 11c')}
      ${p.netPTC >= 0
        ? tableRow('26', 'Net Premium Tax Credit (credit — you get more back)', fmtLine(p.netPTC), 'Line 24 minus Line 25. Enter on Schedule 3, Line 9.', 'refund')
        : tableRow('27', 'Excess advance PTC to repay', fmtLine(-p.netPTC), 'Line 25 minus Line 24. Enter on Schedule 2, Line 2.', 'owe')}
    </table>` : '';

  // ── SCHEDULE B ──
  const totalInterest = t.taxableInt;
  const totalDivs     = t.ordDiv;
  const needsSchB     = totalInterest > 1500 || totalDivs > 1500;
  const schBSummary   = (totalInterest > 0 || totalDivs > 0) ? `
    <table class="form-line-table">
      ${sectionRow('Schedule B (Form 1040) — Interest and Ordinary Dividends')}
      ${needsSchB ? sectionRow('Schedule B is REQUIRED because your interest or dividends exceed $1,500') : sectionRow('Schedule B is recommended (required if interest or dividends exceed $1,500)')}
      ${sectionRow('Part I — Interest')}
      ${tableRow('1', 'Payer(s) and amounts', 'List each 1099-INT payer separately in Free File Fillable Forms', 'Enter each bank, brokerage, or institution name and the interest amount from Box 1 of each 1099-INT')}
      ${tableRow('2', 'Total taxable interest', fmtLine(num('interest-taxable')), 'Flows to Form 1040, Line 2b')}
      ${num('interest-us-govt') > 0 ? tableRow('3', 'U.S. savings bond / Treasury interest (Box 3)', fmtLine(num('interest-us-govt')), 'Also included in Line 2 total; separately tracked for Colorado subtraction') : skipRow('Line 3 — U.S. bond interest (none)')}
      ${tableRow('4', 'Total (Line 2)', fmtLine(num('interest-taxable')), 'This is your total taxable interest')}
      ${sectionRow('Part II — Ordinary Dividends')}
      ${tableRow('5', 'Payer(s) and amounts', 'List each 1099-DIV payer separately', 'Enter each brokerage or company name and Box 1a of each 1099-DIV')}
      ${tableRow('6', 'Total ordinary dividends', fmtLine(t.ordDiv), 'Flows to Form 1040, Line 3b')}
      ${sectionRow('Part III — Foreign Accounts and Trusts')}
      ${tableRow('7a', 'Foreign financial account?', 'Answer Yes or No', 'Check "Yes" only if you had a financial interest in or signature authority over a foreign bank, securities, or other financial account')}
    </table>` : '';

  // ── SCHEDULE D + FORM 8949 ──
  const hasCapGains = radio('has-capital-gains') === 'yes';
  const schDSummary = hasCapGains ? `
    <table class="form-line-table">
      ${sectionRow('Form 8949 — Sales and Other Dispositions of Capital Assets')}
      ${sectionRow('Part I — Short-Term (held 1 year or less) — taxed as ordinary income')}
      ${tableRow('Col A', 'Description of property', 'e.g., "100 sh Apple Inc" — enter each transaction from your 1099-B')}
      ${tableRow('Col B', 'Date acquired', 'MM/DD/YYYY format')}
      ${tableRow('Col C', 'Date sold', 'MM/DD/YYYY format')}
      ${tableRow('Col D', 'Proceeds (sales price)', 'From 1099-B Box 1d')}
      ${tableRow('Col E', 'Cost or other basis', 'From 1099-B Box 1e — your purchase price + commissions')}
      ${tableRow('Col H', 'Gain or (loss)', 'Col D minus Col E. Totals flow to Schedule D, Line 1 or Line 2.')}
      ${sectionRow('Part II — Long-Term (held more than 1 year) — preferential tax rates')}
      ${tableRow('Col H', 'Gain or (loss)', 'Totals flow to Schedule D, Line 8 or Line 9.')}
      ${sectionRow('Schedule D — Capital Gains and Losses')}
      ${sectionRow('Part I — Short-Term Capital Gains and Losses')}
      ${t.stcg !== 0 ? tableRow('7', 'Net short-term capital gain (loss)', fmtLine(t.stcg), 'Enter here; taxed at ordinary income rates') : skipRow('Lines 1–7 — No short-term transactions entered')}
      ${sectionRow('Part II — Long-Term Capital Gains and Losses')}
      ${t.ltcg !== 0 ? tableRow('15', 'Net long-term capital gain (loss)', fmtLine(t.ltcg), 'Enter here; taxed at 0%, 15%, or 20% depending on your income') : skipRow('Lines 8–15 — No long-term transactions entered')}
      ${sectionRow('Part III — Summary')}
      ${tableRow('16', 'Combined net capital gain (loss)', fmtLine(t.capGainNet))}
      ${t.capGainNet < -3000
        ? tableRow('21', 'Capital loss deduction limit', fmtLine(-3000), `You have ${fmt(Math.abs(t.capGainNet) - 3000)} in losses that carry forward to 2026`, 'owe')
        : tableRow('17 / 19', 'Net capital gain (loss) → Form 1040, Line 7', fmtLine(t.capGain1040))}
      ${t.ltcg > 0 ? tableRow('—', 'LTCG tax rates (28% rate gain worksheet if assets include collectibles or Sec. 1202 stock)', 'Taxed at 0% (if taxable income ≤ $48,350), 15% (≤ $533,400), or 20% (above $533,400)') : ''}
    </table>` : '';

  // ── FORM 8960 ──
  const hasNIIT = t.niit > 0;
  const netInvIncome = Math.max(0, t.taxableInt + t.ordDiv + t.capGain1040);
  const f8960Summary = hasNIIT ? `
    <table class="form-line-table">
      ${sectionRow('Form 8960 — Net Investment Income Tax')}
      ${sectionRow('Part I — Net Investment Income')}
      ${tableRow('1', 'Taxable interest', fmtLine(t.taxableInt))}
      ${tableRow('2', 'Ordinary dividends', fmtLine(t.ordDiv))}
      ${tableRow('3', 'Annuities (none)', '—')}
      ${t.capGain1040 !== 0 ? tableRow('4a', 'Net capital gain from Schedule D', fmtLine(t.capGain1040)) : skipRow('Lines 4–5 — Capital gains / passive income (none)')}
      ${tableRow('8', 'Net investment income (add lines 1–7)', fmtLine(netInvIncome))}
      ${sectionRow('Part II — Net Investment Income Tax')}
      ${tableRow('9a', 'Modified adjusted gross income (MAGI)', fmtLine(t.agi))}
      ${tableRow('9b', 'Threshold for your filing status (Single)', fmtLine(200000))}
      ${tableRow('9c', 'MAGI exceeding threshold (Line 9a − Line 9b)', fmtLine(Math.max(0, t.agi - 200000)))}
      ${tableRow('10', 'Smaller of Line 8 or Line 9c', fmtLine(Math.min(netInvIncome, Math.max(0, t.agi - 200000))))}
      ${tableRow('12', 'Net Investment Income Tax (Line 10 × 3.8%) → Form 1040 via Schedule 2', fmtLine(t.niit), '', 'owe')}
    </table>` : '';

  // ── SCHEDULE 2 ──
  const hasSch2 = (t.niit + t.ptcRepay + t.addlMedicareTax) > 0;
  const sch2Summary = hasSch2 ? `
    <table class="form-line-table">
      ${sectionRow('Schedule 2 (Form 1040) — Additional Taxes')}
      ${sectionRow('Part I — Alternative Minimum Tax')}
      ${skipRow('Line 1 — Alternative Minimum Tax (AMT) — does not apply based on your income profile')}
      ${sectionRow('Part II — Other Taxes')}
      ${t.ptcRepay > 0
        ? tableRow('2', 'Excess advance premium tax credit repayment (Form 8962, Line 27)', fmtLine(t.ptcRepay), 'You received more in advance PTC than you qualified for — this is the repayment', 'owe')
        : skipRow('Line 2 — Excess advance PTC repayment (none — you had a net credit)')}
      ${t.niit > 0
        ? tableRow('12', 'Net investment income tax (Form 8960, Line 12)', fmtLine(t.niit), '', 'owe')
        : skipRow('Line 12 — NIIT (none — income below threshold)')}
      ${t.addlMedicareTax > 0
        ? tableRow('11', 'Additional Medicare Tax (Form 8959)', fmtLine(t.addlMedicareTax), 'Wages over $200,000 subject to extra 0.9%', 'owe')
        : skipRow('Line 11 — Additional Medicare Tax (none)')}
      ${tableRow('10', 'Total additional taxes → Form 1040, Line 17', fmtLine(t.niit + t.ptcRepay + t.addlMedicareTax), '', 'owe')}
    </table>` : '';

  // ── SCHEDULE 3 ──
  const hasSch3 = (t.childCareCredit + t.educationCredit + t.ptcCredit) > 0;
  const sch3Summary = hasSch3 ? `
    <table class="form-line-table">
      ${sectionRow('Schedule 3 (Form 1040) — Additional Credits and Payments')}
      ${sectionRow('Part I — Nonrefundable Credits')}
      ${t.childCareCredit > 0
        ? tableRow('2', 'Child and dependent care credit (Form 2441, Line 11)', fmtLine(t.childCareCredit), 'See Form 2441 below for calculation detail', 'refund')
        : skipRow('Line 2 — Child and dependent care credit (none)')}
      ${t.educationCredit > 0
        ? tableRow('3', 'Education credits (Form 8863)', fmtLine(t.educationCredit), 'See Form 8863 below for calculation detail', 'refund')
        : skipRow('Line 3 — Education credits (none)')}
      ${tableRow('8', 'Total nonrefundable credits (Part I) → Form 1040, Line 24', fmtLine(t.childCareCredit + t.educationCredit), '', 'refund')}
      ${sectionRow('Part II — Other Payments and Refundable Credits')}
      ${t.ptcCredit > 0
        ? tableRow('9', 'Net premium tax credit (Form 8962, Line 26)', fmtLine(t.ptcCredit), 'Refundable — can increase your refund beyond tax owed', 'refund')
        : skipRow('Line 9 — Net premium tax credit (none — or repayment applies)')}
      ${tableRow('15', 'Total other payments / refundable credits → Form 1040, Line 30', fmtLine(t.ptcCredit), '', 'refund')}
    </table>` : '';

  // ── FORM 8889 ──
  const hasHSA = radio('has-hsa') === 'yes';
  const hsaContrib = num('hsa-contribution');
  const w2Box12W   = num('w2-box12-w');
  const f8889Summary = hasHSA ? `
    <table class="form-line-table">
      ${sectionRow('Form 8889 — Health Savings Accounts (HSAs)')}
      ${tableRow('1', 'Coverage type', 'Self-only HDHP (check box for self-only or family based on your plan)')}
      ${tableRow('2', 'HSA contributions you made (not including employer)', fmtLine(hsaContrib))}
      ${w2Box12W > 0 ? tableRow('9', 'Employer contributions (W-2 Box 12, Code W)', fmtLine(w2Box12W)) : skipRow('Line 9 — Employer HSA contributions (none or not entered)')}
      ${tableRow('5', '2025 HSA contribution limit (self-only)', fmtLine(4300), 'Or $8,550 for family coverage; add $1,000 if age 55+')}
      ${tableRow('13', 'HSA deduction', fmtLine(t.hsaDeduction), 'Smaller of Line 2 and Line 8. Flows to Schedule 1, Line 13.', 'refund')}
      ${sectionRow('Part II — HSA Distributions (if you took money out)')}
      ${tableRow('—', 'Qualified medical expenses', 'Distributions for qualified medical expenses are tax-free. Non-qualified distributions are taxable + 20% penalty. Report on Lines 14a–17.')}
    </table>` : '';

  // ── FORM 2441 ──
  const hasChildCareForm = radio('has-childcare') === 'yes';
  const f2441Summary = hasChildCareForm ? `
    <table class="form-line-table">
      ${sectionRow('Form 2441 — Child and Dependent Care Expenses')}
      ${sectionRow('Part I — Persons or Organizations Who Provided the Care')}
      ${tableRow('1', 'Provider name', 'Enter each care provider name (daycare center, nanny, etc.)')}
      ${tableRow('1', 'Provider address', 'Street address of the care provider')}
      ${tableRow('1', 'Provider TIN / SSN / EIN', 'Required — the IRS will verify this. Get it from the provider.')}
      ${tableRow('1', 'Amount paid', fmtLine(num('childcare-expenses')))}
      ${sectionRow('Part II — Credit Calculation')}
      ${tableRow('2', 'Qualifying persons', 'Enter name and SSN of each qualifying child or dependent under age 13')}
      ${tableRow('3', 'Qualifying expenses incurred (maximum $3,000 for 1 child / $6,000 for 2+)', fmtLine(Math.min(num('childcare-expenses'), 3000)))}
      ${tableRow('8', 'Applicable credit percentage', t.agi > 43000 ? '20%' : t.agi > 33000 ? '25%' : t.agi > 23000 ? '30%' : '35%', `Based on your AGI of ${fmt(t.agi)}`)}
      ${tableRow('11', 'Child and dependent care credit → Form 1040, Line 19 / Schedule 3, Line 2', fmtLine(t.childCareCredit), '', 'refund')}
      ${sectionRow('Note on Free File Fillable Forms')}
      ${tableRow('—', 'In Free File Fillable Forms', 'Add Form 2441 using the "Add" button from Form 1040. Complete the provider information in Part I before Part II.')}
    </table>` : '';

  // ── FORM 8863 ──
  const hasEducationForm = radio('has-education') === 'yes';
  const f8863Summary = hasEducationForm ? `
    <table class="form-line-table">
      ${sectionRow('Form 8863 — Education Credits (American Opportunity and Lifetime Learning Credits)')}
      ${sectionRow('IMPORTANT: In Free File Fillable Forms, complete Part III BEFORE Parts I and II')}
      ${sectionRow('Part III — Student and Educational Institution Information')}
      ${tableRow('20', 'Student name', 'Your name (or qualifying student\'s name)')}
      ${tableRow('20', 'Student SSN', 'Your Social Security Number')}
      ${tableRow('20', 'Educational institution name and address', 'From your Form 1098-T')}
      ${tableRow('20', 'Qualified expenses from 1098-T', fmtLine(num('education-expenses')), 'Box 1 of your Form 1098-T (adjusted for tax-free assistance)')}
      ${tableRow('20', 'First 4 years of higher education?', 'Answer Yes/No — determines AOTC vs. Lifetime Learning Credit eligibility')}
      ${sectionRow('Part II — Lifetime Learning Credit (if not eligible for AOTC)')}
      ${tableRow('10', 'Adjusted qualified education expenses', fmtLine(num('education-expenses')))}
      ${tableRow('14', 'Lifetime Learning Credit (20% of expenses, max $2,000)', fmtLine(t.educationCredit), 'Nonrefundable — flows to Schedule 3, Line 3', 'refund')}
      ${sectionRow('Phase-out information')}
      ${tableRow('—', 'LLC phase-out range (Single)', '$80,000 – $90,000 MAGI', 'Credit is reduced for income in this range and eliminated above $90,000')}
    </table>` : '';

  // ── FORM 4562 (depreciation in 1120-S) ──
  const hasDepreciation = t.f1120s.depreciation > 0;
  const f4562Summary = hasDepreciation ? `
    <table class="form-line-table">
      ${sectionRow('Form 4562 — Depreciation and Amortization (attached to Form 1120-S)')}
      ${sectionRow('Note: In Free File Fillable Forms, Form 4562 must be added from its parent Schedule E — you cannot add it standalone')}
      ${sectionRow('Part I — Election to Expense Certain Property (Section 179)')}
      ${tableRow('1', 'Maximum Section 179 deduction (2025)', fmtLine(1220000), 'Total Section 179 deduction for all property cannot exceed $1,220,000 in 2025')}
      ${tableRow('6', 'Listed property Section 179 (vehicles, computers)', 'Enter from Part V if applicable')}
      ${tableRow('12', 'Section 179 expense deduction', fmtLine(t.f1120s.depreciation), 'Enter the portion claimed under Section 179')}
      ${sectionRow('Part II — MACRS Depreciation (for multi-year property not expensed under Sec. 179)')}
      ${tableRow('14b–g', 'MACRS property', 'Enter each asset: classification (5-yr, 7-yr, etc.), basis, recovery period, convention, method, and deduction')}
      ${tableRow('22', 'Total MACRS depreciation', 'Subtotal of all MACRS deductions')}
      ${tableRow('22+12', 'Total depreciation → Form 1120-S, Line 14', fmtLine(t.f1120s.depreciation))}
    </table>` : '';

  // ── Next Steps — Free File Fillable Forms ──
  const formEntryOrder = [
    hasCapGains ? 'Form 8949 (each transaction)' : '',
    hasCapGains ? 'Schedule D' : '',
    (totalInterest > 1500 || totalDivs > 1500) ? 'Schedule B' : '',
    hasF8962    ? 'Form 8962' : '',
    hasSch2     ? 'Schedule 2' : '',
    hasSch3     ? 'Schedule 3' : '',
    hasChildCareForm ? 'Form 2441' : '',
    hasEducationForm ? 'Form 8863' : '',
    hasHSA      ? 'Form 8889' : '',
    hasNIIT     ? 'Form 8960' : '',
    t.sch1a.total > 0 ? 'Schedule 1-A' : '',
    'Schedule E (K-1 data from your finalized 1120-S)',
    t.sliDeduction > 0 || t.iraDeduction > 0 || t.hsaDeduction > 0 || t.skorpK1 !== 0 ? 'Schedule 1' : '',
    t.useItemized ? 'Schedule A' : '',
    'Form 1040 (last — it pulls from all other forms)',
  ].filter(Boolean).join(' → ');

  const nextSteps = `
    <table class="form-line-table">
      ${sectionRow('Free File Fillable Forms — How to Use')}
      ${tableRow('Access', 'Go to freefilefillableforms.com', 'Do NOT search for it on Google — go directly to freefilefillableforms.com or start at IRS.gov/FreeFile. Available January 26 – October 20, 2026.')}
      ${tableRow('Account', 'Create an account', 'You will need a valid email address. One account per taxpayer.')}
      ${tableRow('Start', 'Select Form 1040 to begin', 'The program works by building around Form 1040 — all other schedules are added and linked from it.')}
      ${sectionRow('Critical Tips — Read Before You Start')}
      ${tableRow('Do the Math', 'Use the "Do the Math" button', 'After entering data on any form, click "Do the Math" to run calculations. Calculated lines cannot be manually overridden — if a line calculates, you cannot type in it.')}
      ${tableRow('Digital Assets', 'Answer the digital asset question', 'Form 1040 requires you to check YES or NO on the digital assets question (cryptocurrency, NFTs, etc.). Leaving it blank will prevent e-filing.')}
      ${tableRow('Negatives', 'Use minus sign for negative numbers', 'Enter losses and negative amounts with a leading minus sign (e.g., -1500). Do NOT use parentheses or brackets — the form will not accept them.')}
      ${tableRow('Adding Forms', 'Add forms using the "Add" button', 'Most supporting forms (Schedule A, Schedule B, Form 2441, etc.) must be added from Form 1040 using the "Add" button on the relevant line — not as standalone forms.')}
      ${tableRow('4562 Note', 'Form 4562 must be added from Schedule E', 'If you have depreciation on your 1120-S, Form 4562 for your personal return must be added from Schedule E, not standalone.')}
      ${tableRow('Education', 'Form 8863: complete Part III FIRST', 'For education credits, complete Part III (student and institution info) before entering data in Parts I and II.')}
      ${tableRow('Attachments', 'Cannot attach PDF documents', 'You cannot attach any supporting documents (1099-B detail, 1095-A, depreciation schedules) as PDFs. Only forms available within the program can be included.')}
      ${tableRow('Save often', 'Session can time out', 'Save your return frequently. The system may time out after periods of inactivity. You can return and complete later before the October 20 deadline.')}
      ${sectionRow('Form Entry Order for Your Return (Personal 1040 — enter in this sequence)')}
      ${tableRow('Order', formEntryOrder, '')}
      ${sectionRow('Identity Verification')}
      ${tableRow('Prior-year AGI', 'Enter your 2024 AGI to verify identity', '$192,967', 'This was your 2024 Married Filing Jointly AGI. Use the full joint amount on the e-filing identity screen.')}
      ${tableRow('PIN', 'Alternative to AGI', 'You may use a Self-Select PIN instead of your prior-year AGI if you have one from last year')}
      ${sectionRow('Corporate Return (Form 1120-S) — Filed Separately')}
      ${tableRow('1120-S', `File Form 1120-S for ${scorpName} (EIN ${scorpEIN})`, `Due March 17, 2026. Use IRS.gov or commercial tax software — Free File Fillable Forms does NOT support Form 1120-S. Extension: Form 7004 (extends to September 15, 2026). File 1120-S first to get your finalized K-1 before completing your personal 1040.`)}
      ${sectionRow('State Return — Colorado')}
      ${tableRow('DR 0104', 'File Colorado return separately', 'Free File Fillable Forms is federal only. File Colorado at Revenue.Colorado.gov (MyColorado portal). Colorado due date: April 15, 2026.')}
      ${tableRow('Extension', 'Colorado extension', 'File Colorado DR 0158-I by April 15 if you need more time. Colorado grants an automatic 6-month extension if you filed a federal extension.')}
      ${sectionRow('Deadlines and Payment')}
      ${tableRow('Federal', 'Filing and payment deadline', 'April 15, 2026. Extension to file: Form 4868 (extends to October 15, 2026). Extension to file ≠ extension to pay — pay any balance due by April 15.')}
      ${t.fedOwed > 0
        ? tableRow('Pay federal', `Federal balance due: ${fmt(t.fedOwed)}`, 'Pay at IRS.gov/DirectPay (free). Select "Balance Due" and tax year 2025, Form 1040. Also accepted: debit/credit card (fee applies), check made to "United States Treasury".')
        : skipRow('Federal payment — you have a refund or break even')}
      ${t.coOwed > 0
        ? tableRow('Pay Colorado', `Colorado balance due: ${fmt(t.coOwed)}`, 'Pay at Revenue.Colorado.gov. Use e-check (free) or credit card. Reference DR 0104 for 2025.')
        : skipRow('Colorado payment — you have a refund or break even')}
      ${sectionRow('After You E-File')}
      ${tableRow('Acknowledgment', 'Check your email', 'You will receive an acceptance or rejection email from customer_service@freefilefillableforms.com within 24–48 hours. Save the acknowledgment number.')}
      ${tableRow('Rejection', 'If your return is rejected', 'Use the Error Search Tool at freefilefillableforms.com to find the cause. Common causes: wrong prior-year AGI, missing digital assets answer, or Social Security number mismatch.')}
      ${tableRow('State link', 'IRS.gov/FreeFile resources', 'Program limitations and available forms: IRS.gov/e-file-providers/free-file-fillable-forms-program-limitations-and-available-forms')}
    </table>`;

  // ── Assemble final output ──
  el.innerHTML = `
    ${fedBox}${coBox}

    <div class="summary-section">
      <div class="summary-section-title">Form 1040 — Line by Line</div>
      ${f1040}
    </div>

    ${(totalInterest > 0 || totalDivs > 0) ? `<div class="summary-section"><div class="summary-section-title">Schedule B — Interest and Ordinary Dividends${needsSchB ? ' (REQUIRED — exceeds $1,500 threshold)' : ''}</div>${schBSummary}</div>` : ''}

    ${hasCapGains ? `<div class="summary-section"><div class="summary-section-title">Form 8949 &amp; Schedule D — Capital Gains and Losses</div>${schDSummary}</div>` : ''}

    <div class="summary-section">
      <div class="summary-section-title">Schedule 1 — Additional Income &amp; Adjustments</div>
      ${hasSch1Income || hasSch1Adj ? sch1 : '<div class="callout callout-info"><div class="callout-body">No additional income or adjustments — you may not need Schedule 1.</div></div>'}
    </div>

    ${hasSch1A ? `<div class="summary-section"><div class="summary-section-title">Schedule 1-A — New 2025 Deductions</div>${sch1a}</div>` : ''}

    ${hasF8962 ? `<div class="summary-section"><div class="summary-section-title">Form 8962 — Premium Tax Credit (Connect for Health Colorado)</div>${f8962Summary}</div>` : ''}

    ${hasSch2 ? `<div class="summary-section"><div class="summary-section-title">Schedule 2 — Additional Taxes</div>${sch2Summary}</div>` : ''}

    ${hasSch3 ? `<div class="summary-section"><div class="summary-section-title">Schedule 3 — Additional Credits and Payments</div>${sch3Summary}</div>` : ''}

    ${hasNIIT ? `<div class="summary-section"><div class="summary-section-title">Form 8960 — Net Investment Income Tax</div>${f8960Summary}</div>` : ''}

    ${hasChildCareForm ? `<div class="summary-section"><div class="summary-section-title">Form 2441 — Child and Dependent Care Expenses</div>${f2441Summary}</div>` : ''}

    ${hasEducationForm ? `<div class="summary-section"><div class="summary-section-title">Form 8863 — Education Credits</div>${f8863Summary}</div>` : ''}

    ${hasHSA ? `<div class="summary-section"><div class="summary-section-title">Form 8889 — Health Savings Account</div>${f8889Summary}</div>` : ''}

    <div class="summary-section">
      <div class="summary-section-title">Form 1120-S — S-Corporation Return (${scorpName})</div>
      ${f1120sSummary}
    </div>

    <div class="summary-section">
      <div class="summary-section-title">Schedule K-1 &amp; Schedule E, Part II — Your Share</div>
      ${schE}
    </div>

    ${hasDepreciation ? `<div class="summary-section"><div class="summary-section-title">Form 4562 — Depreciation and Amortization</div>${f4562Summary}</div>` : ''}

    <div class="summary-section">
      <div class="summary-section-title">${t.useItemized ? 'Schedule A — Itemized Deductions' : 'Schedule A — Not Needed'}</div>
      ${schA}
    </div>

    <div class="summary-section">
      <div class="summary-section-title">Colorado DR 0104 — State Return</div>
      ${coDR0104}
    </div>

    <div class="summary-section">
      <div class="summary-section-title">Free File Fillable Forms — How to File &amp; Next Steps</div>
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
