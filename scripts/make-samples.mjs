/**
 * Generates the four built-in sample datasets as static CSV files.
 *
 * These are intentionally realistic, not lorem ipsum: seasonal sales with a real March
 * dip, an HR table with a gender pay gap and attrition skew, student marks with
 * attendance correlation, and a churn table where month-to-month contracts churn hardest.
 * A few deliberate quality problems (blank cells, duplicate rows, untrimmed spaces, an
 * outlier) are injected so the cleaning screen and health score have something to show.
 *
 * Deterministic: a fixed-seed mulberry32 PRNG, so regenerating gives identical files and
 * the unit tests can assert exact numbers.
 *
 * Run: node scripts/make-samples.mjs
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '../static/samples');
mkdirSync(outDir, { recursive: true });

function mulberry32(seed) {
	let a = seed >>> 0;
	return function () {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const pick = (rng, list) => list[Math.floor(rng() * list.length)];
const between = (rng, lo, hi) => lo + rng() * (hi - lo);
const intBetween = (rng, lo, hi) => Math.floor(between(rng, lo, hi + 1));
/** Box-Muller normal, clamped to a sane range. */
function normal(rng, mean, sd, lo = -Infinity, hi = Infinity) {
	const u = Math.max(1e-9, rng());
	const v = rng();
	const n = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
	return Math.min(hi, Math.max(lo, mean + n * sd));
}

function toCsv(headers, rows) {
	const esc = (v) => {
		const s = v === null || v === undefined ? '' : String(v);
		return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
	};
	return [headers.join(','), ...rows.map((r) => r.map(esc).join(','))].join('\n') + '\n';
}

const iso = (d) => d.toISOString().slice(0, 10);

/* ------------------------------ 1. Sales ---------------------------------- */
// 18 months of order lines for a fictional Indian home-and-kitchen retailer.
function salesDataset() {
	const rng = mulberry32(20240317);
	const regions = ['North', 'South', 'East', 'West', 'Central'];
	const channels = ['Online Store', 'Retail Partner', 'Marketplace', 'Direct Sales'];
	const categories = {
		Cookware: ['Triply Saucepan 2L', 'Cast Iron Skillet 26cm', 'Pressure Cooker 5L', 'Nonstick Tawa 28cm'],
		Storage: ['Airtight Jar Set 6pc', 'Steel Lunch Box 3T', 'Vacuum Flask 1L', 'Spice Rack 12pc'],
		'Small Appliances': ['Mixer Grinder 750W', 'Electric Kettle 1.5L', 'Hand Blender 400W', 'Air Fryer 4L'],
		Dining: ['Dinner Set 18pc', 'Copper Water Bottle', 'Ceramic Mug Set 4pc', 'Serving Tray Oak'],
		'Home Care': ['Microfibre Mop', 'Laundry Basket 50L', 'Shoe Rack 4 Tier', 'Door Mat Coir']
	};
	const basePrice = {
		Cookware: [899, 3499],
		Storage: [349, 1799],
		'Small Appliances': [1499, 8999],
		Dining: [499, 4299],
		'Home Care': [249, 2499]
	};
	const reps = [
		'Aarti Deshmukh',
		'Rohan Mehta',
		'Priya Nair',
		'Imran Shaikh',
		'Kavya Reddy',
		'Daniel Fernandes',
		'Sneha Kulkarni',
		'Vikram Bose'
	];

	const rows = [];
	const start = new Date(Date.UTC(2024, 0, 1));
	const days = 548; // 1 Jan 2024 -> 1 Jul 2025

	for (let day = 0; day < days; day++) {
		const date = new Date(start.getTime() + day * 86400000);
		const month = date.getUTCMonth();
		const dow = date.getUTCDay();

		// Seasonality: Diwali (Oct-Nov) peak, March slump after the fiscal year close,
		// weekend lift online.
		let seasonal = 1;
		if (month === 9 || month === 10) seasonal = 1.65;
		else if (month === 2) seasonal = 0.62; // the "sharp drop in March" the insights find
		else if (month === 3) seasonal = 0.78;
		else if (month === 5 || month === 6) seasonal = 1.12;
		const weekend = dow === 0 || dow === 6 ? 1.2 : 1;
		const growth = 1 + day / days / 2.2; // steady year-on-year growth

		const orders = Math.max(1, Math.round(normal(rng, 9 * seasonal * weekend * growth, 2.5, 1, 30)));
		for (let o = 0; o < orders; o++) {
			const category = pick(rng, Object.keys(categories));
			const product = pick(rng, categories[category]);
			const [lo, hi] = basePrice[category];
			const unitPrice = Math.round(between(rng, lo, hi) / 10) * 10;
			const qty = Math.max(1, Math.round(normal(rng, 2.1, 1.3, 1, 9)));
			// West and South are the strong regions; Central lags badly.
			const regionWeight = { North: 1, South: 1.25, East: 0.8, West: 1.4, Central: 0.35 };
			const region = pick(rng, regions);
			const channel = pick(rng, channels);
			const discountPct = rng() < 0.34 ? Math.round(between(rng, 5, 30)) : 0;
			const gross = unitPrice * qty * regionWeight[region];
			const revenue = Math.round(gross * (1 - discountPct / 100));
			const cost = Math.round(revenue * between(rng, 0.52, 0.74));
			const rating = rng() < 0.08 ? '' : Number(normal(rng, 4.2, 0.6, 1, 5).toFixed(1));

			rows.push([
				`SO-${String(rows.length + 10001)}`,
				iso(date),
				region,
				channel,
				category,
				product,
				pick(rng, reps),
				qty,
				unitPrice,
				discountPct,
				revenue,
				cost,
				revenue - cost,
				rating
			]);
		}
	}

	// --- deliberate quality problems for the cleaning screen ---
	// 1. Untrimmed category/region spellings that split a bar chart in two.
	for (let i = 0; i < 40; i++) {
		const r = rows[Math.floor(rng() * rows.length)];
		r[2] = ` ${r[2]} `;
	}
	// 2. Missing revenue in a handful of rows.
	for (let i = 0; i < 25; i++) {
		rows[Math.floor(rng() * rows.length)][10] = '';
	}
	// 3. Exact duplicate order lines (a double-import).
	for (let i = 0; i < 18; i++) {
		rows.push([...rows[Math.floor(rng() * rows.length)]]);
	}
	// 4. One data-entry outlier: an extra zero on the unit price.
	rows[500][8] = rows[500][8] * 10;
	rows[500][10] = rows[500][10] * 10;

	return {
		file: 'sales.csv',
		csv: toCsv(
			[
				'Order ID',
				'Order Date',
				'Region',
				'Channel',
				'Category',
				'Product',
				'Sales Rep',
				'Quantity',
				'Unit Price',
				'Discount %',
				'Revenue',
				'Cost',
				'Profit',
				'Customer Rating'
			],
			rows
		),
		rows: rows.length
	};
}

/* -------------------------------- 2. HR ----------------------------------- */
// Employee table with a real pay gap, tenure effects and attrition concentrated in
// low-satisfaction, low-tenure staff.
function hrDataset() {
	const rng = mulberry32(776611);
	const departments = {
		Engineering: ['Software Engineer', 'Senior Engineer', 'Engineering Manager', 'QA Analyst', 'DevOps Engineer'],
		Sales: ['Sales Executive', 'Account Manager', 'Regional Sales Head', 'Sales Development Rep'],
		Marketing: ['Marketing Executive', 'Content Strategist', 'Brand Manager', 'SEO Specialist'],
		'Customer Support': ['Support Associate', 'Support Lead', 'Escalation Specialist'],
		Finance: ['Accountant', 'Financial Analyst', 'Finance Manager'],
		'Human Resources': ['HR Executive', 'Talent Partner', 'HR Manager'],
		Operations: ['Operations Associate', 'Logistics Coordinator', 'Operations Manager']
	};
	const bands = {
		'Software Engineer': 1050000,
		'Senior Engineer': 1850000,
		'Engineering Manager': 2900000,
		'QA Analyst': 820000,
		'DevOps Engineer': 1550000,
		'Sales Executive': 620000,
		'Account Manager': 1100000,
		'Regional Sales Head': 2400000,
		'Sales Development Rep': 540000,
		'Marketing Executive': 680000,
		'Content Strategist': 850000,
		'Brand Manager': 1600000,
		'SEO Specialist': 760000,
		'Support Associate': 430000,
		'Support Lead': 760000,
		'Escalation Specialist': 690000,
		Accountant: 720000,
		'Financial Analyst': 980000,
		'Finance Manager': 1900000,
		'HR Executive': 610000,
		'Talent Partner': 890000,
		'HR Manager': 1750000,
		'Operations Associate': 520000,
		'Logistics Coordinator': 640000,
		'Operations Manager': 1500000
	};
	const cities = ['Bengaluru', 'Mumbai', 'Pune', 'Hyderabad', 'Chennai', 'Delhi NCR', 'Remote'];
	const education = ['Diploma', 'Bachelors', 'Masters', 'MBA', 'PhD'];
	const first = [
		'Aditya', 'Meera', 'Rahul', 'Fatima', 'Arjun', 'Ananya', 'Karthik', 'Divya', 'Siddharth',
		'Neha', 'Joseph', 'Pooja', 'Manish', 'Sanjana', 'Tarun', 'Ritika', 'Zoya', 'Harish',
		'Lakshmi', 'Nikhil', 'Sunita', 'Gaurav', 'Shreya', 'Abhishek', 'Varsha', 'Deepak'
	];
	const last = [
		'Sharma', 'Iyer', 'Khan', 'Patel', 'Reddy', 'Banerjee', 'Gupta', 'Menon', 'Joshi',
		'Das', 'Pillai', 'Chauhan', 'Rao', 'Verma', 'Mathew', 'Singh', 'Naidu', 'Ghosh'
	];

	const rows = [];
	for (let i = 0; i < 480; i++) {
		const department = pick(rng, Object.keys(departments));
		const role = pick(rng, departments[department]);
		const gender = rng() < 0.44 ? 'Female' : rng() < 0.985 ? 'Male' : 'Other';
		const tenure = Number(normal(rng, 3.4, 2.6, 0.2, 14).toFixed(1));
		const age = Math.round(Math.min(61, 23 + tenure + normal(rng, 4, 4, 0, 22)));
		// Documented pay gap: women average ~8% below men in the same band.
		const genderFactor = gender === 'Female' ? 0.92 : 1;
		const tenureFactor = 1 + tenure * 0.045;
		const cityFactor = { Bengaluru: 1.08, Mumbai: 1.12, Pune: 0.98, Hyderabad: 1.02, Chennai: 0.95, 'Delhi NCR': 1.05, Remote: 0.9 };
		const city = pick(rng, cities);
		const salary = Math.round(
			(bands[role] * genderFactor * tenureFactor * cityFactor[city] * between(rng, 0.9, 1.12)) / 1000
		) * 1000;
		const satisfaction = Number(normal(rng, 3.6, 0.9, 1, 5).toFixed(1));
		const performance = Number(normal(rng, 3.4 + satisfaction * 0.12, 0.7, 1, 5).toFixed(1));
		const trainingHours = Math.round(normal(rng, 24 + performance * 4, 12, 0, 90));
		// Attrition driven by low satisfaction + short tenure.
		const churnRisk = (5 - satisfaction) * 0.13 + (tenure < 2 ? 0.2 : 0) - performance * 0.03;
		const attrition = rng() < Math.max(0.02, churnRisk) ? 'Yes' : 'No';
		const joinDate = new Date(Date.UTC(2025, 5, 30) - tenure * 365.25 * 86400000);
		const overtime = rng() < (department === 'Customer Support' ? 0.45 : 0.22) ? 'Yes' : 'No';

		rows.push([
			`EMP${String(1000 + i)}`,
			`${pick(rng, first)} ${pick(rng, last)}`,
			department,
			role,
			city,
			gender,
			age,
			pick(rng, education),
			iso(joinDate),
			tenure,
			salary,
			performance,
			satisfaction,
			trainingHours,
			overtime,
			attrition
		]);
	}

	// Quality problems: missing satisfaction scores (survey non-response) + 6 duplicates.
	for (let i = 0; i < 34; i++) rows[Math.floor(rng() * rows.length)][12] = '';
	for (let i = 0; i < 12; i++) rows[Math.floor(rng() * rows.length)][13] = '';
	for (let i = 0; i < 6; i++) rows.push([...rows[Math.floor(rng() * rows.length)]]);

	return {
		file: 'hr-employees.csv',
		csv: toCsv(
			[
				'Employee ID',
				'Name',
				'Department',
				'Job Role',
				'Location',
				'Gender',
				'Age',
				'Education',
				'Join Date',
				'Tenure Years',
				'Annual Salary',
				'Performance Rating',
				'Satisfaction Score',
				'Training Hours',
				'Overtime',
				'Attrition'
			],
			rows
		),
		rows: rows.length
	};
}

/* --------------------------- 3. Student performance ------------------------ */
function studentDataset() {
	const rng = mulberry32(31415926);
	const streams = ['Science', 'Commerce', 'Arts', 'Computer Science'];
	const sections = ['A', 'B', 'C', 'D'];
	const first = [
		'Ishaan', 'Avni', 'Rudra', 'Myra', 'Vihaan', 'Saanvi', 'Kabir', 'Aarohi', 'Reyansh',
		'Anika', 'Advait', 'Navya', 'Dhruv', 'Prisha', 'Yash', 'Tara', 'Ayaan', 'Kiara'
	];
	const last = ['Agarwal', 'Bhatt', 'Chandra', 'Dutta', 'Elango', 'Fernandes', 'Gill', 'Hegde', 'Jain', 'Kapoor', 'Lal', 'Mishra'];

	const rows = [];
	for (let i = 0; i < 620; i++) {
		const stream = pick(rng, streams);
		const attendance = Number(normal(rng, 84, 11, 42, 100).toFixed(1));
		const studyHours = Number(normal(rng, 2.4 + (attendance - 80) * 0.035, 1.1, 0, 8).toFixed(1));
		const tuition = rng() < 0.42 ? 'Yes' : 'No';
		const internet = rng() < 0.86 ? 'Yes' : 'No';
		const parentEd = pick(rng, ['High School', 'Bachelors', 'Masters', 'None']);
		// Marks genuinely correlate with attendance and study hours.
		const lift =
			(attendance - 80) * 0.55 +
			studyHours * 4.2 +
			(tuition === 'Yes' ? 4 : 0) +
			(internet === 'Yes' ? 2.5 : -3) +
			(parentEd === 'Masters' ? 3 : parentEd === 'Bachelors' ? 1.5 : parentEd === 'None' ? -2.5 : 0);
		const base = 55 + lift;
		const math = Math.round(normal(rng, base + (stream === 'Science' || stream === 'Computer Science' ? 4 : -3), 11, 8, 100));
		const science = Math.round(normal(rng, base + (stream === 'Science' ? 5 : -2), 10, 10, 100));
		const english = Math.round(normal(rng, base + (stream === 'Arts' ? 6 : 0), 9, 15, 100));
		const social = Math.round(normal(rng, base + (stream === 'Commerce' ? 3 : 0), 10, 12, 100));
		const total = math + science + english + social;
		const percentage = Number((total / 4).toFixed(1));
		const grade = percentage >= 90 ? 'A+' : percentage >= 80 ? 'A' : percentage >= 70 ? 'B' : percentage >= 60 ? 'C' : percentage >= 50 ? 'D' : 'F';
		const result = percentage >= 40 && Math.min(math, science, english, social) >= 33 ? 'Pass' : 'Fail';

		rows.push([
			`STU${String(2001 + i)}`,
			`${pick(rng, first)} ${pick(rng, last)}`,
			intBetween(rng, 9, 12),
			pick(rng, sections),
			stream,
			rng() < 0.49 ? 'Female' : 'Male',
			attendance,
			studyHours,
			tuition,
			internet,
			parentEd,
			math,
			science,
			english,
			social,
			total,
			percentage,
			grade,
			result
		]);
	}

	// Quality problems: a few unrecorded attendance values and missing marks.
	for (let i = 0; i < 28; i++) rows[Math.floor(rng() * rows.length)][6] = '';
	for (let i = 0; i < 14; i++) rows[Math.floor(rng() * rows.length)][13] = '';

	return {
		file: 'student-performance.csv',
		csv: toCsv(
			[
				'Student ID',
				'Student Name',
				'Class',
				'Section',
				'Stream',
				'Gender',
				'Attendance %',
				'Study Hours Per Day',
				'Private Tuition',
				'Internet At Home',
				'Parent Education',
				'Mathematics',
				'Science',
				'English',
				'Social Studies',
				'Total Marks',
				'Percentage',
				'Grade',
				'Result'
			],
			rows
		),
		rows: rows.length
	};
}

/* ----------------------------- 4. Customer churn --------------------------- */
function churnDataset() {
	const rng = mulberry32(99887766);
	const plans = ['Basic', 'Standard', 'Premium', 'Enterprise'];
	const contracts = ['Month-to-month', 'One year', 'Two year'];
	const payments = ['Credit Card', 'UPI AutoPay', 'Net Banking', 'Bank Transfer', 'Wallet'];
	const supportTiers = ['Standard', 'Priority', 'Dedicated'];
	const industries = ['Retail', 'Education', 'Healthcare', 'Logistics', 'Media', 'Manufacturing', 'Professional Services'];

	const planPrice = { Basic: 499, Standard: 1299, Premium: 2999, Enterprise: 7999 };

	const rows = [];
	const start = new Date(Date.UTC(2022, 0, 1));
	for (let i = 0; i < 900; i++) {
		const plan = pick(rng, plans);
		const contract = pick(rng, contracts);
		const tenure = Math.max(1, Math.round(normal(rng, contract === 'Two year' ? 26 : contract === 'One year' ? 17 : 9, 9, 1, 42)));
		const signup = new Date(start.getTime() + intBetween(rng, 0, 900) * 86400000);
		const seats = Math.max(1, Math.round(normal(rng, plan === 'Enterprise' ? 85 : plan === 'Premium' ? 24 : 7, 12, 1, 320)));
		const monthly = Math.round(planPrice[plan] * (1 + (seats - 1) * 0.06) * between(rng, 0.95, 1.08));
		const totalSpend = monthly * tenure;
		const tickets = Math.max(0, Math.round(normal(rng, 2.6, 2.4, 0, 18)));
		const loginsPerWeek = Number(normal(rng, plan === 'Basic' ? 3.1 : 6.4, 2.4, 0, 20).toFixed(1));
		const nps = Math.round(normal(rng, 7.4 - tickets * 0.28, 2, 0, 10));

		// Churn: month-to-month + low engagement + many tickets is the lethal combination.
		let risk = 0.05;
		if (contract === 'Month-to-month') risk += 0.28;
		if (contract === 'One year') risk += 0.07;
		if (tenure < 6) risk += 0.12;
		if (loginsPerWeek < 2) risk += 0.18;
		if (tickets > 6) risk += 0.14;
		if (nps <= 5) risk += 0.12;
		if (plan === 'Enterprise') risk -= 0.14;
		const churned = rng() < Math.min(0.85, Math.max(0.02, risk));

		rows.push([
			`CUST-${String(5000 + i)}`,
			iso(signup),
			industries[Math.floor(rng() * industries.length)],
			plan,
			contract,
			pick(rng, payments),
			pick(rng, supportTiers),
			seats,
			tenure,
			monthly,
			totalSpend,
			tickets,
			loginsPerWeek,
			nps,
			rng() < 0.37 ? 'Yes' : 'No',
			churned ? 'Yes' : 'No'
		]);
	}

	// Quality problems: missing NPS (survey non-response), blank logins, duplicates and
	// one blank row that the "drop empty rows" action removes.
	for (let i = 0; i < 96; i++) rows[Math.floor(rng() * rows.length)][13] = '';
	for (let i = 0; i < 31; i++) rows[Math.floor(rng() * rows.length)][12] = '';
	for (let i = 0; i < 9; i++) rows.push([...rows[Math.floor(rng() * rows.length)]]);
	rows.splice(300, 0, new Array(16).fill(''));
	rows.splice(640, 0, new Array(16).fill(''));

	return {
		file: 'customer-churn.csv',
		csv: toCsv(
			[
				'Customer ID',
				'Signup Date',
				'Industry',
				'Plan',
				'Contract',
				'Payment Method',
				'Support Tier',
				'Seats',
				'Tenure Months',
				'Monthly Charges',
				'Total Spend',
				'Support Tickets',
				'Logins Per Week',
				'NPS Score',
				'Auto Renew',
				'Churned'
			],
			rows
		),
		rows: rows.length
	};
}

const datasets = [salesDataset(), hrDataset(), studentDataset(), churnDataset()];
for (const d of datasets) {
	writeFileSync(resolve(outDir, d.file), d.csv, 'utf8');
	const kb = (Buffer.byteLength(d.csv) / 1024).toFixed(0);
	console.log(`${d.file.padEnd(26)} ${String(d.rows).padStart(6)} rows  ${kb} KB`);
}
